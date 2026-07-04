/**
 * RAG 嵌入向量管道。
 * 使用 AI SDK v6 的 embed() 和 embedMany() 以及配置的嵌入模型。
 */

import { embed, embedMany, cosineSimilarity } from 'ai';
import { modelRegistry } from './models';

const embeddingModel = modelRegistry.embeddingModel('text-embedding-3-small');

/**
 * 为单个文本生成嵌入向量。
 */
export async function embedText(value: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value,
  });
  return embedding;
}

/**
 * 批量为多个文本生成嵌入向量。
 */
export async function embedTexts(values: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values,
  });
  return embeddings;
}

/**
 * 计算两个向量之间的余弦相似度。
 */
export function similarity(a: number[], b: number[]): number {
  return cosineSimilarity(a, b);
}
