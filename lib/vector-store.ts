/**
 * 本地内存向量存储 —— 当 Pinecone 未配置时的降级方案。
 * 支持与 Pinecone 相同的 API：upsert / query / deleteMany。
 * 数据仅在内存中，重启后丢失。
 */

interface VectorRecord {
  id: string;
  values: number[];
  metadata?: Record<string, string | number | boolean>;
}

const store = new Map<string, VectorRecord>();

/** 余弦相似度 */
function cosineSim(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const memoryVectorStore = {
  upsert(records: Array<{ id: string; values: number[]; metadata?: Record<string, string | number | boolean> }>) {
    for (const r of records) {
      store.set(r.id, { id: r.id, values: r.values, metadata: r.metadata });
    }
    console.log(`本地向量库: 已存入 ${records.length} 条`);
  },

  query(vector: number[], topK: number = 5, filter?: Record<string, string | number | boolean>) {
    const scored: Array<{ id: string; score: number; metadata?: Record<string, string | number | boolean> }> = [];
    for (const [, record] of store) {
      // 应用元数据过滤
      if (filter) {
        const meta = record.metadata;
        if (!meta) continue;
        let match = true;
        for (const [key, val] of Object.entries(filter)) {
          if (meta[key] !== val) { match = false; break; }
        }
        if (!match) continue;
      }
      scored.push({
        id: record.id,
        score: cosineSim(vector, record.values),
        metadata: record.metadata,
      });
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, topK);
    console.log(`本地向量库: 查询返回 ${top.length} 条，最高相似度 ${top[0]?.score.toFixed(4) || 'N/A'}`);
    return top;
  },

  deleteMany(ids: string[]) {
    for (const id of ids) store.delete(id);
  },

  size() {
    return store.size;
  },

  /** 列出所有已索引的文档信息 */
  list() {
    const seen = new Map<string, { fileName: string; chunkCount: number }>();
    for (const [, record] of store) {
      const name = (record.metadata?.fileName as string) || 'unknown';
      const existing = seen.get(name);
      if (existing) {
        existing.chunkCount++;
      } else {
        seen.set(name, { fileName: name, chunkCount: 1 });
      }
    }
    return Array.from(seen.values());
  },

  clear() {
    store.clear();
  },
};
