/**
 * RAG 嵌入向量管道。
 * 优先使用 AI SDK 嵌入模型（OpenAI / Ollama），失败时自动降级到本地算法。
 */

import { embed, embedMany, cosineSimilarity } from 'ai';
import { modelRegistry } from './models';

const embeddingModel = modelRegistry.embeddingModel('text-embedding-3-small');

// ============================================================
// 本地降级嵌入（无需任何外部 API）
// ============================================================

const LOCAL_DIM = 256;

/**
 * 用字符 trigram 哈希生成一个简单的固定维度向量。
 * 不需要任何外部服务，纯本地计算。
 */
function localEmbed(value: string): number[] {
  const vec = new Array(LOCAL_DIM).fill(0);
  const text = value.toLowerCase();

  // 字符 trigram 特征
  for (let i = 0; i < text.length - 2; i++) {
    const trigram = text.substring(i, i + 3);
    let hash = 0;
    for (let j = 0; j < trigram.length; j++) {
      hash = (hash * 31 + trigram.charCodeAt(j)) & 0xffffffff;
    }
    vec[hash % LOCAL_DIM] += 1;
  }

  // L2 归一化
  let norm = 0;
  for (let i = 0; i < LOCAL_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < LOCAL_DIM; i++) vec[i] /= norm;

  return vec;
}

/** 是否正在使用本地降级嵌入 */
let useLocalFallback = false;

export function isUsingLocalEmbeddings(): boolean {
  return useLocalFallback;
}

// ============================================================
// 公开 API
// ============================================================

/**
 * 为单个文本生成嵌入向量。
 * 优先调用 AI 模型，失败自动降级到本地算法。
 */
export async function embedText(value: string): Promise<number[]> {
  try {
    const { embedding } = await embed({ model: embeddingModel, value });
    if (useLocalFallback) {
      console.log('嵌入: 已切换回云端模型');
      useLocalFallback = false;
    }
    return embedding;
  } catch {
    if (!useLocalFallback) {
      console.warn('嵌入模型不可用（未配置 OpenAI Key 且 Ollama 未运行），降级到本地算法');
      useLocalFallback = true;
    }
    return localEmbed(value);
  }
}

/**
 * 批量为多个文本生成嵌入向量。
 */
export async function embedTexts(values: string[]): Promise<number[][]> {
  try {
    const { embeddings } = await embedMany({ model: embeddingModel, values });
    return embeddings;
  } catch {
    if (!useLocalFallback) {
      console.warn('嵌入模型不可用，降级到本地算法处理批量文本');
      useLocalFallback = true;
    }
    return values.map(localEmbed);
  }
}

/**
 * 计算两个向量之间的余弦相似度。
 */
export function similarity(a: number[], b: number[]): number {
  return cosineSimilarity(a, b);
}
