import { indexDocument } from '@/lib/rag';
import { memoryVectorStore } from '@/lib/vector-store';

/** 支持的文件类型 */
const ALLOWED_EXTENSIONS = [
  '.txt', '.md', '.json',
  '.ts', '.tsx', '.js', '.jsx',
  '.css', '.html', '.csv',
];

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return Response.json({ error: '请上传至少一个文件' }, { status: 400 });
    }

    let indexed = 0;
    const skipped: string[] = [];

    for (const file of files) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();

      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        skipped.push(`${file.name}（不支持的类型 ${ext}）`);
        continue;
      }

      const content = await file.text();
      if (!content.trim()) {
        skipped.push(`${file.name}（空文件）`);
        continue;
      }

      await indexDocument(content, {
        fileName: file.name,
        fileType: ext,
        source: 'upload',
        uploadedAt: new Date().toISOString(),
      });

      indexed++;
      console.log(`RAG 上传: 已索引 "${file.name}" (${content.length} 字符)`);
    }

    return Response.json({
      success: true,
      indexed,
      total: memoryVectorStore.size(),
      skipped: skipped.length > 0 ? skipped : undefined,
    });
  } catch (error) {
    console.error('RAG 上传失败:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

/** 查看已索引的文件列表和数量 */
export async function GET() {
  return Response.json({
    total: memoryVectorStore.size(),
    files: memoryVectorStore.list(),
  });
}

/** 清空全部索引 */
export async function DELETE() {
  memoryVectorStore.clear();
  return Response.json({ success: true, total: 0 });
}
