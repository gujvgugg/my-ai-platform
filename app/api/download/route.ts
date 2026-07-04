import JSZip from 'jszip';

/**
 * POST /api/download
 * 接收代码文件数组，返回 ZIP 压缩包下载。
 * 请求体: { files: [{ filePath: string, content: string }], projectName?: string }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const files = body.files as Array<{ filePath: string; content: string }> | undefined;
    const projectName = (body.projectName as string) || 'generated-code';

    if (!Array.isArray(files) || files.length === 0) {
      return Response.json({ error: '请提供非空的 files 数组' }, { status: 400 });
    }

    const zip = new JSZip();

    for (const file of files) {
      zip.file(file.filePath, file.content);
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const safeName = projectName.replace(/[^a-zA-Z0-9一-鿿]/g, '_');

    // 转为 Uint8Array（Node.js Buffer 在新版类型中不直接兼容 BodyInit）
    const zipData = new Uint8Array(zipBuffer);
    return new Response(zipData, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeName}.zip"`,
        'Content-Length': String(zipBuffer.length),
      },
    });
  } catch (error) {
    console.error('ZIP 生成错误:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
