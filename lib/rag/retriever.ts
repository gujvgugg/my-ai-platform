/**
 * RAG 检索器 —— 将查询文本嵌入并检索向量库中最相关的文档块。
 * 默认启用混合检索（BM25 关键词 + 向量语义 + RRF 融合）。
 * 支持 Pinecone（云端）和本地内存库自动降级。
 */

import { embedText } from '../embeddings';
import { queryVectors, getVectorBackend } from '../pinecone';
import { memoryVectorStore } from '../vector-store';
import { hybridSearch } from './hybrid';
import { deduplicateByContent, applyScoreThreshold } from './reranker';
import { expandQuery } from './hybrid';

export interface RetrievedChunk {
  content: string;
  score: number;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * 为给定查询检索最相关的上下文文档块。
 * 默认使用混合检索（BM25 + 向量 + RRF + 去重），
 * 可通过 useHybrid: false 回退到纯向量检索。
 */
export async function retrieveContext(
  query: string,
  options: {
    topK?: number;
    filter?: Record<string, string | number | boolean>;
    /** 是否启用混合检索（默认 true） */
    useHybrid?: boolean;
    /** 分数阈值（默认 0.01 for RRF, 0.25 for pure vector） */
    scoreThreshold?: number;
    /** 是否去重（默认 true） */
    dedup?: boolean;
  } = {}
): Promise<RetrievedChunk[]> {
  const {
    topK = 5,
    filter,
    useHybrid = true,
    dedup = true,
  } = options;

  try {
    // —— 混合检索路径 ——
    if (useHybrid) {
      const results = await hybridSearch(query, {
        topK,
        scoreThreshold: options.scoreThreshold ?? 0.01,
        dedup,
        filter,
      });

      const backend = getVectorBackend();
      const bm25Size = memoryVectorStore.bm25.size();
      console.log(
        `RAG 检索 (hybrid, ${backend}${bm25Size > 0 ? ' + BM25' : ''}): ${results.length} 条结果`
      );

      return results.map((r) => ({
        content: r.content,
        score: r.score,
        metadata: r.metadata,
      }));
    }

    // —— 纯向量检索路径（兼容） ——
    const expandedQuery = expandQuery(query);
    const queryEmbedding = await embedText(expandedQuery);
    const matches = await queryVectors(queryEmbedding, { topK, filter });

    let results: RetrievedChunk[] = matches.map((m) => ({
      content: (m.metadata?.content as string) || '',
      score: m.score,
      metadata: m.metadata,
    }));

    if (dedup && results.length > 1) {
      results = deduplicateByContent(results);
    }
    results = applyScoreThreshold(
      results,
      options.scoreThreshold ?? 0.25
    ).slice(0, topK);

    console.log(
      `RAG 检索 (${getVectorBackend()}): ${results.length} 条结果`
    );

    return results;
  } catch (error) {
    console.error('RAG 检索失败:', error);
    return [];
  }
}

/**
 * 将检索到的文档块格式化为 LLM 提示词。
 */
export function formatRetrievedContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '';

  return chunks
    .map((c, i) => {
      const source = c.metadata?.fileName || c.metadata?.topic || '';
      const sourceLabel = source ? `, 来源: ${source}` : '';
      return `[来源 ${i + 1}] (相关度: ${c.score.toFixed(3)}${sourceLabel})\n${c.content}`;
    })
    .join('\n\n---\n\n');
}
