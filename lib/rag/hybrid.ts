/**
 * 混合检索编排器 —— BM25 关键词 + 向量语义 + RRF 融合。
 *
 * RRF (Reciprocal Rank Fusion)：
 *   rrf_score = 1 / (k + rank)  其中 k=60（标准值），rank 从 1 开始
 *   combinedScore = vectorWeight × rrf_vector + (1 - vectorWeight) × rrf_bm25
 */

import { embedText } from '@/lib/embeddings';
import { queryVectors } from '@/lib/pinecone';
import { memoryVectorStore } from '@/lib/vector-store';
import { deduplicateByContent, applyScoreThreshold } from './reranker';

// ============================================================
// 类型
// ============================================================

export interface SearchResult {
  id: string;
  score: number;
  content: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface HybridOptions {
  topK?: number;
  scoreThreshold?: number;
  dedup?: boolean;
  vectorWeight?: number;
  filter?: Record<string, string | number | boolean>;
}

// ============================================================
// RRF 常数
// ============================================================

const RRF_K = 60;

// ============================================================
// 查询扩展
// ============================================================

/**
 * 技术术语同义词扩展表。
 * 帮助短查询匹配到更多相关文档。
 */
const QUERY_EXPANSIONS: Record<string, string> = {
  'server actions': 'server action serverActions use server formAction form action',
  'server components': 'server component rsc react server component server side rendering',
  'client components': 'client component csr client side rendering use client',
  'ssr': 'server side rendering ssr getServerSideProps server component',
  'csr': 'client side rendering csr client component use client',
  'ssg': 'static site generation ssg static generation generateStaticParams',
  'isr': 'incremental static regeneration isr revalidate',
  'api': 'api route handler route.ts REST endpoint',
  'db': 'db database drizzle orm schema postgres',
  'orm': 'orm drizzle database schema relation query',
  'tailwind': 'tailwind tailwindcss css utility class',
  'rag': 'rag retrieval augmented generation embedding vector pinecone',
  'rsc': 'rsc react server component server component server rendering',
  'ppr': 'ppr partial prerendering static dynamic streaming',
};

/**
 * 查询扩展：技术术语同义词 + 驼峰拆分。
 * 返回扩展后的查询字符串（供向量嵌入和 BM25 共同使用）。
 */
export function expandQuery(query: string): string {
  const lower = query.toLowerCase();
  const expansions: string[] = [query];

  // 1. 技术术语扩展
  for (const [term, expansion] of Object.entries(QUERY_EXPANSIONS)) {
    if (lower.includes(term)) {
      expansions.push(expansion);
    }
  }

  // 2. 驼峰标识符拆分
  const camelRe = /\b([a-z]+)([A-Z][a-z]+)+\b/g;
  let match: RegExpExecArray | null;
  while ((match = camelRe.exec(query)) !== null) {
    const parts = match[0].split(/(?=[A-Z])/).map((s) => s.toLowerCase());
    expansions.push(parts.join(' '));
  }

  return expansions.join(' ');
}

// ============================================================
// RRF 融合
// ============================================================

interface RankedResult {
  id: string;
  rrfVector: number;
  rrfBm25: number;
  combinedScore: number;
  vectorScore: number;
  bm25Score: number;
  content: string;
  metadata?: Record<string, string | number | boolean>;
}

function reciprocalRankFusion(
  vectorResults: SearchResult[],
  bm25Results: SearchResult[],
  vectorWeight: number = 0.6
): RankedResult[] {
  const resultMap = new Map<string, RankedResult>();

  // 向量结果定 rank
  vectorResults.forEach((r, i) => {
    const rank = i + 1;
    const rrfScore = 1 / (RRF_K + rank);
    resultMap.set(r.id, {
      id: r.id,
      rrfVector: rrfScore,
      rrfBm25: 0,
      combinedScore: 0,
      vectorScore: r.score,
      bm25Score: 0,
      content: r.content,
      metadata: r.metadata,
    });
  });

  // BM25 结果定 rank
  bm25Results.forEach((r, i) => {
    const rank = i + 1;
    const rrfScore = 1 / (RRF_K + rank);
    const existing = resultMap.get(r.id);
    if (existing) {
      existing.rrfBm25 = rrfScore;
      existing.bm25Score = r.score;
    } else {
      resultMap.set(r.id, {
        id: r.id,
        rrfVector: 0,
        rrfBm25: rrfScore,
        combinedScore: 0,
        vectorScore: 0,
        bm25Score: r.score,
        content: r.content,
        metadata: r.metadata,
      });
    }
  });

  // 融合分数
  for (const entry of resultMap.values()) {
    entry.combinedScore =
      vectorWeight * entry.rrfVector + (1 - vectorWeight) * entry.rrfBm25;
  }

  // 按融合分数降序排列
  return Array.from(resultMap.values()).sort(
    (a, b) => b.combinedScore - a.combinedScore
  );
}

// ============================================================
// 混合检索主函数
// ============================================================

/**
 * 混合检索：BM25 关键词 + 向量语义 → RRF 融合 → 去重 → 阈值过滤。
 * 如果 BM25 索引为空，降级为纯向量检索。
 */
export async function hybridSearch(
  query: string,
  options: HybridOptions = {}
): Promise<SearchResult[]> {
  const {
    topK = 5,
    scoreThreshold = 0.01, // RRF 分数很小（~0.01-0.02），阈值设低
    dedup = true,
    vectorWeight = 0.6,
    filter,
  } = options;

  // 1. 查询扩展
  const expandedQuery = expandQuery(query);

  // 2. 向量检索（多取一些供 RRF 融合）
  const queryEmbedding = await embedText(expandedQuery);
  const vectorMatches = await queryVectors(queryEmbedding, {
    topK: topK * 3,
    filter,
  });

  const vectorResults: SearchResult[] = vectorMatches.map((m) => ({
    id: m.id,
    score: m.score,
    content: String(m.metadata?.content || ''),
    metadata: m.metadata as Record<string, string | number | boolean> | undefined,
  }));

  // 3. BM25 关键词检索
  let bm25Results: SearchResult[] = [];
  if (memoryVectorStore.bm25.size() > 0) {
    const bm25Matches = memoryVectorStore.bm25.search(expandedQuery, topK * 3);
    // 为 BM25 结果填充 content（从 memoryVectorStore 获取）
    bm25Results = bm25Matches
      .map((m) => {
        const content =
          memoryVectorStore.getContent(m.id) || '';
        return {
          id: m.id,
          score: m.score,
          content,
        };
      })
      .filter((r) => r.content.length > 0);
  }

  // 4. RRF 融合（如果 BM25 有结果）
  let ranked: SearchResult[];
  if (bm25Results.length > 0) {
    const fused = reciprocalRankFusion(vectorResults, bm25Results, vectorWeight);
    ranked = fused.map((r) => ({
      id: r.id,
      score: r.combinedScore,
      content: r.content,
      metadata: r.metadata,
    }));
  } else {
    // 纯向量检索（无 BM25）
    ranked = vectorResults;
  }

  // 5. 去重
  if (dedup && ranked.length > 1) {
    ranked = deduplicateByContent(ranked);
  }

  // 6. 分数阈值过滤
  ranked = applyScoreThreshold(ranked, scoreThreshold);

  // 7. 返回 Top-K
  const final = ranked.slice(0, topK);

  if (bm25Results.length > 0) {
    console.log(
      `混合检索: 向量${vectorResults.length}条 + BM25${bm25Results.length}条 → RRF融合 → 最终${final.length}条`
    );
  }

  return final;
}
