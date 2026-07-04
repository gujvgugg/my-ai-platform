/**
 * RAG 检索器 —— 将查询文本嵌入并检索向量库中最相关的文档块。
 * 支持 Pinecone（云端）和本地内存库自动降级。
 */

import { embedText } from '../embeddings';
import { queryVectors, getVectorBackend } from '../pinecone';

export interface RetrievedChunk {
  content: string;
  score: number;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * 为给定查询检索最相关的上下文文档块。
 */
export async function retrieveContext(
  query: string,
  options: {
    topK?: number;
    filter?: Record<string, string | number | boolean>;
  } = {}
): Promise<RetrievedChunk[]> {
  const { topK = 5, filter } = options;

  try {
    const queryEmbedding = await embedText(query);
    const matches = await queryVectors(queryEmbedding, { topK, filter });

    console.log(`RAG 检索 (${getVectorBackend()}): ${matches.length} 条结果`);

    return matches.map((m) => ({
      content: (m.metadata?.content as string) || '',
      score: m.score,
      metadata: m.metadata,
    }));
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
    .map((c, i) => `[来源 ${i + 1}] (相关度: ${c.score.toFixed(3)})\n${c.content}`)
    .join('\n\n---\n\n');
}
