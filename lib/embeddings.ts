/**
 * RAG 嵌入向量管道。
 * 优先 AI SDK 模型 → 本地 TF-IDF 加权嵌入，维度统一为 768。
 */

import { embed, embedMany, cosineSimilarity } from 'ai';
import { modelRegistry } from './models';

const embeddingModel = modelRegistry.embeddingModel('text-embedding-3-small');

// 统一维度 — 所有嵌入归一化到此维度
export const EMBEDDING_DIM = 768;

// ============================================================
// 共享词汇表（TF-IDF 加权嵌入用）
// ============================================================

/** 词汇表：词 → 维度索引 */
const vocabIndex = new Map<string, number>();
/** 文档频率：词 → 出现在多少篇文档中 */
const vocabDF = new Map<string, number>();
/** 已索引的文档总数 */
let vocabDocCount = 0;
/** 词汇表已锁定的维度数 */
let vocabDimCount = 0;
/** 词汇表最大维度（剩余留给 OOV 哈希） */
const MAX_VOCAB_DIM = 600;

// ============================================================
// 分词器（英文 + CJK + 代码标识符）
// ============================================================

/**
 * 统一分词：英文单词 unigram + CJK 字符 bigram + 驼峰/下划线拆分。
 * 保证嵌入和 BM25 使用相同的 token 集合。
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const lower = text.toLowerCase();

  // 1. 英文单词（连续字母）
  const wordRe = /[a-z][a-z0-9_]*[a-z]|[a-z]/g;
  let match: RegExpExecArray | null;
  while ((match = wordRe.exec(lower)) !== null) {
    tokens.push(match[0]);
    // 驼峰拆分
    const parts = match[0].split(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|_|-/);
    if (parts.length > 1) {
      for (const p of parts) {
        if (p.length >= 2) tokens.push(p.toLowerCase());
      }
    }
  }

  // 2. CJK 字符 bigram（中日韩文字）
  const cjkRe = /[一-鿿぀-ゟ゠-ヿ가-힯]+/g;
  while ((match = cjkRe.exec(text)) !== null) {
    const cjk = match[0];
    for (let i = 0; i < cjk.length - 1; i++) {
      tokens.push(cjk.substring(i, i + 2));
    }
    if (cjk.length === 1) tokens.push(cjk);
  }

  // 3. 代码标识符（如 useActionState, getServerSideProps）
  const codeRe = /\b[a-z]+(?:[A-Z][a-z]+)+\b/g;
  while ((match = codeRe.exec(text)) !== null) {
    // 已通过驼峰拆分处理，这里保留原始复合形式
    tokens.push(match[0].toLowerCase());
  }

  return tokens.filter((t) => t.length >= 2);
}

// ============================================================
// 词汇表管理
// ============================================================

/** 向词汇表添加一篇文档（更新 DF 和索引映射） */
export function addDocumentToVocabulary(text: string): void {
  const terms = new Set(tokenize(text));
  for (const term of terms) {
    const df = (vocabDF.get(term) || 0) + 1;
    vocabDF.set(term, df);
    if (!vocabIndex.has(term) && vocabDimCount < MAX_VOCAB_DIM) {
      vocabIndex.set(term, vocabDimCount++);
    }
  }
  vocabDocCount++;
}

/** 批量重建 IDF 值（种子/上传后调用） */
export function updateVocabulary(documents: string[]): void {
  vocabIndex.clear();
  vocabDF.clear();
  vocabDocCount = 0;
  vocabDimCount = 0;
  for (const doc of documents) {
    addDocumentToVocabulary(doc);
  }
}

/** 获取 IDF 值 */
function getIdf(term: string): number {
  const df = vocabDF.get(term) || 0;
  if (df === 0) return 0;
  return Math.log(1 + vocabDocCount / df);
}

// ============================================================
// 本地降级嵌入（TF-IDF 加权 + OOV 哈希，768 维）
// ============================================================

function localEmbed(value: string): number[] {
  const vec = new Array(EMBEDDING_DIM).fill(0);
  const tokens = tokenize(value);

  // 1. 词频统计
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }

  // 2. TF-IDF 权重填入词汇维度
  for (const [term, freq] of tf) {
    const idx = vocabIndex.get(term);
    if (idx !== undefined && idx < MAX_VOCAB_DIM) {
      const tfWeight = 1 + Math.log(freq);
      const idf = getIdf(term);
      vec[idx] = tfWeight * idf;
    }
  }

  // 3. OOV 字符 3-gram 哈希填入剩余维度（vocabDim ~ 768）
  const lower = value.toLowerCase();
  for (let i = 0; i < lower.length - 2; i++) {
    const trigram = lower.substring(i, i + 3);
    let hash = 0;
    for (let j = 0; j < trigram.length; j++) {
      hash = ((hash << 5) - hash + trigram.charCodeAt(j)) | 0;
    }
    const dim = vocabDimCount + (Math.abs(hash) % (EMBEDDING_DIM - vocabDimCount));
    vec[dim] += 1;
  }

  // 4. L2 归一化
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBEDDING_DIM; i++) vec[i] /= norm;

  return vec;
}

// ============================================================
// 嵌入来源追踪
// ============================================================

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
