/**
 * RAG 检索结果后处理：去重 + 分数阈值过滤。
 * 在 RRF 融合之后、返回 Top-K 之前执行。
 */

import { tokenize } from '@/lib/embeddings';

// ============================================================
// 类型（与 retriever 的 RetrievedChunk 兼容）
// ============================================================

interface ChunkLike {
  content: string;
  score: number;
  metadata?: Record<string, string | number | boolean>;
}

// ============================================================
// Jaccard 去重
// ============================================================

/**
 * 基于 Jaccard 相似度的内容去重。
 * 对分数排序后的结果逐一检查：如果当前 chunk 与任何已保留 chunk
 * 的 Jaccard 相似度 > threshold，则丢弃当前 chunk（保留高分者）。
 */
export function deduplicateByContent<T extends ChunkLike>(
  chunks: T[],
  jaccardThreshold: number = 0.5
): T[] {
  if (chunks.length <= 1) return chunks;

  const kept: { tokens: Set<string>; chunk: T }[] = [];

  for (const chunk of chunks) {
    const tokens = new Set(tokenize(chunk.content));
    if (tokens.size === 0) {
      kept.push({ tokens, chunk });
      continue;
    }

    // 检查与已保留 chunk 的重叠度
    let isDuplicate = false;
    for (const k of kept) {
      if (k.tokens.size === 0) continue;

      // Jaccard 相似度
      let intersection = 0;
      for (const t of tokens) {
        if (k.tokens.has(t)) intersection++;
      }
      const union = tokens.size + k.tokens.size - intersection;
      const jaccard = union > 0 ? intersection / union : 0;

      // 同文档（sourceDocId 相同）用更严格阈值
      const sameDoc =
        chunk.metadata?.sourceDocId &&
        k.chunk.metadata?.sourceDocId &&
        chunk.metadata.sourceDocId === k.chunk.metadata.sourceDocId;
      const threshold = sameDoc ? 0.2 : jaccardThreshold;

      if (jaccard > threshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      kept.push({ tokens, chunk });
    }
  }

  return kept.map((k) => k.chunk);
}

// ============================================================
// 分数阈值过滤
// ============================================================

/**
 * 过滤掉分数低于阈值的 chunk。
 * 对于 RRF 融合分数，建议 threshold ≈ 0.005-0.01
 * 对于纯余弦相似度，建议 threshold ≈ 0.2-0.3
 */
export function applyScoreThreshold<T extends ChunkLike>(
  chunks: T[],
  threshold: number = 0.01
): T[] {
  return chunks.filter((c) => c.score >= threshold);
}
