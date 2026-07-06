/**
 * RAG 索引器 —— 将文档分块、生成嵌入向量并存入 Pinecone。
 * 同时同步 BM25 关键词索引和嵌入词汇表。
 */

import { chunkText, chunkDocuments, type Chunk } from './chunker';
import { embedText, embedTexts, addDocumentToVocabulary } from '../embeddings';
import { upsertVectors } from '../pinecone';
import { memoryVectorStore } from '../vector-store';

/**
 * 将单个文档索引到向量存储中。
 */
export async function indexDocument(
  content: string,
  metadata?: Record<string, string | number | boolean>
): Promise<number> {
  // 为每个文档生成唯一 ID（用于去重）
  const sourceDocId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const chunks = chunkText(content, {
    metadata: { ...metadata, sourceDocId },
  });
  if (chunks.length === 0) return 0;

  // 更新嵌入词汇表
  addDocumentToVocabulary(content);

  const texts = chunks.map((c) => c.content);
  const embeddings = await embedTexts(texts);

  const vectors = chunks.map((chunk, i) => ({
    id: `doc-${Date.now()}-${chunk.index}`,
    values: embeddings[i],
    metadata: {
      content: chunk.content,
      chunkIndex: chunk.index,
      ...chunk.metadata,
    },
  }));

  await upsertVectors(vectors);
  return vectors.length;
}

/**
 * 批量索引多个文档。
 */
export async function indexDocuments(
  docs: Array<{ content: string; metadata?: Record<string, string | number | boolean> }>
): Promise<number> {
  // 更新嵌入词汇表
  for (const doc of docs) {
    addDocumentToVocabulary(doc.content);
  }

  // 为每个文档生成唯一 ID
  const docsWithId = docs.map((doc, docIndex) => ({
    ...doc,
    sourceDocId: `batch-${Date.now()}-${docIndex}`,
  }));

  const chunks = chunkDocuments(
    docsWithId.map((d) => ({
      content: d.content,
      metadata: { ...d.metadata, sourceDocId: d.sourceDocId },
    }))
  );
  if (chunks.length === 0) return 0;

  // 分批嵌入，避免超过速率限制
  const batchSize = 20;
  let total = 0;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map((c) => c.content);
    const embeddings = await embedTexts(texts);

    const vectors = batch.map((chunk, j) => ({
      id: `doc-${Date.now()}-${i}-${j}`,
      values: embeddings[j],
      metadata: {
        content: chunk.content.substring(0, 500),
        chunkIndex: chunk.index,
        ...chunk.metadata,
      },
    }));

    await upsertVectors(vectors);
    total += vectors.length;
  }

  return total;
}

/**
 * 索引生成的代码文件以支持语义检索。
 */
export async function indexCodeFiles(
  files: Array<{ filePath: string; content: string }>,
  projectId: number
): Promise<number> {
  const docs = files.map((f, docIndex) => ({
    content: `// 文件: ${f.filePath}\n${f.content}`,
    metadata: {
      filePath: f.filePath,
      projectId: String(projectId),
      type: 'code',
      sourceDocId: `code-${projectId}-${docIndex}-${Date.now()}`,
    },
  }));

  return indexDocuments(docs);
}
