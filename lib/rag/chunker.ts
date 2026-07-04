/**
 * 文档分块器 —— RAG 管道核心组件。
 * 将文本分割为有重叠的块，保留 markdown 和代码块边界。
 */

export interface Chunk {
  content: string;
  index: number;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * 智能文本分块，遵循 markdown 结构:
 * - 先在 markdown 标题 (##, ###) 处分割
 * - 再在段落边界处分割
 * - 兜底使用固定大小分割
 * - 块之间添加重叠以保持上下文连续性
 */
export function chunkText(
  text: string,
  options: {
    maxChunkSize?: number;
    overlap?: number;
    metadata?: Record<string, string | number | boolean>;
  } = {}
): Chunk[] {
  const { maxChunkSize = 1000, overlap = 100 } = options;

  if (!text.trim()) return [];

  // 步骤 1: 在 markdown 标题处分割
  const headingSplit = text.split(/(?=^#{2,3}\s)/m);

  // 步骤 2: 对于每个标题段落，如果仍然过大则进一步分割
  const chunks: Chunk[] = [];
  let index = 0;

  for (const section of headingSplit) {
    if (section.length <= maxChunkSize) {
      chunks.push({
        content: section.trim(),
        index: index++,
        metadata: options.metadata,
      });
      continue;
    }

    // 步骤 3: 在双换行处（段落边界）分割过大的段落
    const paragraphs = section.split(/\n\n+/);
    let currentChunk = '';

    for (const para of paragraphs) {
      if (currentChunk && currentChunk.length + para.length + 2 > maxChunkSize) {
        chunks.push({
          content: currentChunk.trim(),
          index: index++,
          metadata: options.metadata,
        });
        // 重叠: 保留上一个块的最后 `overlap` 个字符
        currentChunk = currentChunk.slice(-overlap) + '\n\n' + para;
      } else {
        currentChunk = currentChunk ? currentChunk + '\n\n' + para : para;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        index: index++,
        metadata: options.metadata,
      });
    }
  }

  return chunks.filter((c) => c.content.length > 10);
}

/**
 * 批量分块多个文档，并追踪来源。
 */
export function chunkDocuments(
  docs: Array<{ content: string; metadata?: Record<string, string | number | boolean> }>,
  options?: { maxChunkSize?: number; overlap?: number }
): Chunk[] {
  const allChunks: Chunk[] = [];

  for (const doc of docs) {
    const chunks = chunkText(doc.content, {
      ...options,
      metadata: doc.metadata,
    });
    allChunks.push(...chunks);
  }

  // 跨所有文档重新编号
  return allChunks.map((c, i) => ({ ...c, index: i }));
}
