/**
 * 向量数据库客户端 —— Pinecone 优先，无配置时自动降级到本地内存库。
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { env } from './env';
import { memoryVectorStore } from './vector-store';

let pineconeClient: Pinecone | null = null;

function getPineconeClient(): Pinecone | null {
  if (!env.PINECONE_API_KEY) return null;
  if (!pineconeClient) {
    pineconeClient = new Pinecone({ apiKey: env.PINECONE_API_KEY });
  }
  return pineconeClient;
}

function getPineconeIndex() {
  const client = getPineconeClient();
  if (!client) return null;
  return client.index(env.PINECONE_INDEX);
}

/** 是否使用 Pinecone 云端 */
export function isPineconeAvailable(): boolean {
  return !!env.PINECONE_API_KEY;
}

/** 返回当前使用的后端名称 */
export function getVectorBackend(): 'pinecone' | 'memory' {
  return isPineconeAvailable() ? 'pinecone' : 'memory';
}

/**
 * 批量插入向量。
 */
export async function upsertVectors(
  vectors: Array<{
    id: string;
    values: number[];
    metadata?: Record<string, string | number | boolean>;
  }>
): Promise<void> {
  const index = getPineconeIndex();
  if (index) {
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      await index.upsert({ records: vectors.slice(i, i + batchSize) });
    }
    return;
  }

  // 降级到内存库
  memoryVectorStore.upsert(vectors.map((v) => ({
    ...v,
    metadata: { ...v.metadata, dim: String(v.values.length) },
  })));
  return;
}

/**
 * 查询最相似的向量。
 */
export async function queryVectors(
  vector: number[],
  options: { topK?: number; filter?: Record<string, string | number | boolean> } = {}
): Promise<
  Array<{ id: string; score: number; metadata?: Record<string, string | number | boolean> }>
> {
  const index = getPineconeIndex();
  if (index) {
    const result = await index.query({
      vector,
      topK: options.topK || 5,
      filter: options.filter || undefined,
      includeMetadata: true,
    });
    return (result.matches || []).map((m) => ({
      id: m.id,
      score: m.score || 0,
      metadata: m.metadata as Record<string, string | number | boolean> | undefined,
    }));
  }

  // 降级到内存库
  return memoryVectorStore.query(vector, options.topK, options.filter);
}

/**
 * 按 ID 批量删除向量。
 */
export async function deleteVectors(ids: string[]): Promise<void> {
  const index = getPineconeIndex();
  if (index) {
    await index.deleteMany({ ids });
    return;
  }
  memoryVectorStore.deleteMany(ids);
}
