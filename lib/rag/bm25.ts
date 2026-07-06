/**
 * BM25 关键词检索引擎。
 * 纯内存实现，无外部依赖，用于混合检索的关键词匹配层。
 *
 * BM25 公式（标准 Okapi BM25）：
 *   score(q, d) = Σ IDF(t) × (tf(t,d) × (k1 + 1)) / (tf(t,d) + k1 × (1 - b + b × |d| / avgdl))
 *   其中 IDF(t) = log(1 + (N - df(t) + 0.5) / (df(t) + 0.5))
 */

import { tokenize } from '@/lib/embeddings';

// ============================================================
// 类型
// ============================================================

interface BM25Doc {
  id: string;
  tokens: string[];
  length: number;
}

interface ScoredDoc {
  id: string;
  score: number;
}

// ============================================================
// 配置常量
// ============================================================

const K1 = 1.5; // 词频饱和度参数（标准值）
const B = 0.75; // 长度归一化参数（标准值）

// ============================================================
// BM25Index 类
// ============================================================

export class BM25Index {
  // 倒排索引：词 → 文档ID → 词频
  private invertedIndex = new Map<string, Map<string, number>>();
  // 文档存储：文档ID → 文档数据
  private docStore = new Map<string, BM25Doc>();
  // 文档频率：词 → 包含该词的文档数
  private docFreq = new Map<string, number>();
  // 平均文档长度
  private avgDocLength = 0;
  // 文档总数
  private totalDocs = 0;

  // ============================================================
  // 文档管理
  // ============================================================

  /** 添加一篇文档 */
  addDocument(id: string, content: string): void {
    // 移除旧版本（如果存在）
    this.removeDocument(id);

    const tokens = tokenize(content);
    const doc: BM25Doc = { id, tokens, length: tokens.length };
    this.docStore.set(id, doc);
    this.totalDocs++;

    // 更新平均长度
    this.avgDocLength =
      (this.avgDocLength * (this.totalDocs - 1) + tokens.length) /
      this.totalDocs;

    // 更新词频和倒排索引
    const tf = new Map<string, number>();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }

    for (const [term, freq] of tf) {
      // 文档频率
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Map());
        this.docFreq.set(term, 0);
      }
      this.invertedIndex.get(term)!.set(id, freq);
      this.docFreq.set(term, this.docFreq.get(term)! + 1);
    }
  }

  /** 移除一篇文档 */
  removeDocument(id: string): void {
    const doc = this.docStore.get(id);
    if (!doc) return;

    const tf = new Map<string, number>();
    for (const t of doc.tokens) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }

    for (const [term, freq] of tf) {
      const postings = this.invertedIndex.get(term);
      if (postings) {
        postings.delete(id);
        if (postings.size === 0) {
          this.invertedIndex.delete(term);
          this.docFreq.delete(term);
        } else {
          this.docFreq.set(term, postings.size);
        }
      }
    }

    this.docStore.delete(id);
    this.totalDocs--;

    // 重新计算平均长度
    if (this.totalDocs > 0) {
      let totalLen = 0;
      for (const d of this.docStore.values()) totalLen += d.length;
      this.avgDocLength = totalLen / this.totalDocs;
    } else {
      this.avgDocLength = 0;
    }
  }

  // ============================================================
  // 搜索
  // ============================================================

  /** BM25 搜索，返回 topK 个结果及其分数 */
  search(query: string, topK: number = 10): ScoredDoc[] {
    if (this.totalDocs === 0) return [];

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    // 计算每个候选文档的 BM25 分数
    const scores = new Map<string, number>();
    const avgdl = this.avgDocLength || 1;

    for (const term of queryTokens) {
      const postings = this.invertedIndex.get(term);
      if (!postings) continue;

      const df = postings.size;
      const idf = Math.log(
        1 + (this.totalDocs - df + 0.5) / (df + 0.5)
      );

      for (const [docId, tf] of postings) {
        const docLen = this.docStore.get(docId)?.length || avgdl;
        const numerator = tf * (K1 + 1);
        const denominator = tf + K1 * (1 - B + B * (docLen / avgdl));
        const score = idf * (numerator / denominator);

        scores.set(docId, (scores.get(docId) || 0) + score);
      }
    }

    // 排序取 Top-K
    const ranked = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([id, score]) => ({ id, score }));

    // 归一化到 [0, 1]（除以最大分数）
    if (ranked.length > 0 && ranked[0].score > 0) {
      const maxScore = ranked[0].score;
      for (const r of ranked) {
        r.score = r.score / maxScore;
      }
    }

    return ranked;
  }

  // ============================================================
  // 查询
  // ============================================================

  /** 根据 ID 获取文档内容 */
  getContent(id: string): string | undefined {
    // BM25 不直接存内容——由 vector-store 提供
    // 这里只维护索引，内容从外部传入
    return undefined;
  }

  /** 文档总数 */
  size(): number {
    return this.totalDocs;
  }

  /** 清空所有索引 */
  clear(): void {
    this.invertedIndex.clear();
    this.docStore.clear();
    this.docFreq.clear();
    this.avgDocLength = 0;
    this.totalDocs = 0;
  }
}
