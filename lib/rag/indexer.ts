/**
 * RAG 索引器 —— 将文档分块、生成嵌入向量并存入 Pinecone。
 */

import { chunkText, chunkDocuments, type Chunk } from './chunker';
import { embedText, embedTexts } from '../embeddings';
import { upsertVectors } from '../pinecone';

/**
 * 将单个文档索引到向量存储中。
 */
export async function indexDocument(
  content: string,
  metadata?: Record<string, string | number | boolean>
): Promise<number> {

  const chunks = chunkText(content, { metadata });
  if (chunks.length === 0) return 0;

  const texts = chunks.map((c) => c.content);
  const embeddings = await embedTexts(texts);

  const vectors = chunks.map((chunk, i) => ({
    id: `doc-${Date.now()}-${chunk.index}`,
    values: embeddings[i],
    metadata: {
      content: chunk.content, // 完整存储（分块最大 1000 字符，远低于 Pinecone 40KB 限制）
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

  const chunks = chunkDocuments(docs);
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
  const docs = files.map((f) => ({
    content: `// 文件: ${f.filePath}\n${f.content}`,
    metadata: {
      filePath: f.filePath,
      projectId: String(projectId),
      type: 'code',
    },
  }));

  return indexDocuments(docs);
}
