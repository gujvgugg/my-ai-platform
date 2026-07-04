import { seedKnowledgeBase } from '@/lib/rag';
import { env } from '@/lib/env';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const secret = (body as Record<string, unknown>).secret as string;

    if (secret !== env.ADMIN_SEED_SECRET) {
      return Response.json({ error: '未授权访问' }, { status: 401 });
    }

    const result = await seedKnowledgeBase();
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error('播种错误:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
