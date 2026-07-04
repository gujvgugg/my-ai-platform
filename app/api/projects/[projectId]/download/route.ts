import JSZip from 'jszip';
import { db } from '@/lib/db';
import { projects } from '@/lib/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const id = parseInt(projectId, 10);

  const project = await db.query.projects.findFirst({
    where: (projects, { eq: eqFn }) => eqFn(projects.id, id),
  });

  if (!project || !project.codeSnapshot) {
    return Response.json({ error: '未找到生成代码' }, { status: 404 });
  }

  const files = project.codeSnapshot as Array<{ filePath: string; content: string }>;

  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.filePath, file.content);
  }

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const safeName = project.name.replace(/[^a-zA-Z0-9一-鿿]/g, '_');

  const zipData = new Uint8Array(zipBuffer);
  return new Response(zipData, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeName}.zip"`,
      'Content-Length': String(zipBuffer.length),
    },
  });
}
