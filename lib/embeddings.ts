/**
 * RAG 嵌入向量管道。
 * 优先 AI SDK 模型 → Ollama → 本地算法，维度统一为 768。
 */

import { embed, embedMany, cosineSimilarity } from 'ai';
import { modelRegistry } from './models';

const embeddingModel = modelRegistry.embeddingModel('text-embedding-3-small');

// 统一维度 — 所有嵌入归一化到此维度
export const EMBEDDING_DIM = 768;

// ============================================================
// 本地降级嵌入（768 维，无需外部 API）
// ============================================================

function localEmbed(value: string): number[] {
  const vec = new Array(EMBEDDING_DIM).fill(0);
  const text = value.toLowerCase();

  // 字符 4-gram 特征，768 维分布
  for (let i = 0; i < text.length - 3; i++) {
    const quad = text.substring(i, i + 4);
    let hash = 0;
    for (let j = 0; j < quad.length; j++) {
      hash = ((hash << 5) - hash + quad.charCodeAt(j)) | 0;
    }
    vec[Math.abs(hash) % EMBEDDING_DIM] += 1;
  }

  // L2 归一化
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBEDDING_DIM; i++) vec[i] /= norm;

  return vec;
}

// 当前使用的嵌入来源
let currentEmbedSource: 'cloud' | 'local' = 'cloud';
let lastSourceChange = 0;

export function isUsingLocalEmbeddings(): boolean {
  return currentEmbedSource === 'local';
}

/** 嵌入来源变化时清空向量库的回调 */
let onSourceChange: (() => void) | null = null;
export function setEmbeddingSourceChangeHandler(fn: () => void) {
  onSourceChange = fn;
}

// ============================================================
// 公开 API
// ============================================================

export async function embedText(value: string): Promise<number[]> {
  try {
    const { embedding } = await embed({ model: embeddingModel, value });
    if (currentEmbedSource === 'local') {
      console.log('嵌入: 已恢复云端模型');
      currentEmbedSource = 'cloud';
      lastSourceChange = Date.now();
      onSourceChange?.();
    }
    // 如果云端嵌入维度不是 768，截断或填充
    return normalizeDim(embedding, EMBEDDING_DIM);
  } catch {
    if (currentEmbedSource !== 'local') {
      console.warn('嵌入模型不可用，降级到本地算法 (768维)');
      currentEmbedSource = 'local';
      lastSourceChange = Date.now();
      onSourceChange?.();
    }
    return localEmbed(value);
  }
}

export async function embedTexts(values: string[]): Promise<number[][]> {
  try {
    const { embeddings } = await embedMany({ model: embeddingModel, values });
    if (currentEmbedSource === 'local') {
      currentEmbedSource = 'cloud';
      lastSourceChange = Date.now();
      onSourceChange?.();
    }
    return embeddings.map((e) => normalizeDim(e, EMBEDDING_DIM));
  } catch {
    if (currentEmbedSource !== 'local') {
      console.warn('嵌入模型不可用，降级到本地算法 (768维)');
      currentEmbedSource = 'local';
      lastSourceChange = Date.now();
      onSourceChange?.();
    }
    return values.map(localEmbed);
  }
}

export function similarity(a: number[], b: number[]): number {
  return cosineSimilarity(a, b);
}

// ============================================================
// 维度归一化
// ============================================================

function normalizeDim(vec: number[], targetDim: number): number[] {
  if (vec.length === targetDim) return vec;
  if (vec.length > targetDim) return vec.slice(0, targetDim);
  // 零填充
  return [...vec, ...new Array(targetDim - vec.length).fill(0)];
}
