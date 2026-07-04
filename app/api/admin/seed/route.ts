import { seedKnowledgeBase } from '@/lib/rag';
import { env } from '@/lib/env';

// 简单的内存计数限制（每次播种消耗嵌入API额度）
let seedCount = 0;
const MAX_SEEDS_PER_HOUR = 10;
const seedTimestamps: number[] = [];

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const secret = (body as Record<string, unknown>).secret as string;

    if (secret !== env.ADMIN_SEED_SECRET) {
      return Response.json({ error: '未授权访问' }, { status: 401 });
    }

    // 速率保护：每小时最多 10 次
    const now = Date.now();
    const recent = seedTimestamps.filter((t) => now - t < 3600_000);
    if (recent.length >= MAX_SEEDS_PER_HOUR) {
      return Response.json({ error: `每小时最多播种 ${MAX_SEEDS_PER_HOUR} 次，请稍后再试` }, { status: 429 });
    }
    seedTimestamps.push(now);
    seedCount++;

    const result = await seedKnowledgeBase();
    return Response.json({
      success: true,
      ...result,
      warning:
        env.ADMIN_SEED_SECRET === 'dev-secret'
          ? '⚠️ 你在使用默认密钥，请在 .env.local 中设置 ADMIN_SEED_SECRET'
          : undefined,
    });
  } catch (error) {
    console.error('播种错误:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
