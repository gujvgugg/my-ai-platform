import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ============================================================
// 内存级速率限制器（按 IP）
// 在 Edge 环境下每个节点独立计数，适合基础防护；
// 生产环境高并发场景可升级为 Vercel KV 或 Redis 方案。
// ============================================================
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 30; // 请求数
const RATE_LIMIT_WINDOW = 60_000; // 1 分钟（毫秒）

// 无需 API 认证的公开端点
const PUBLIC_PATHS: string[] = [
  '/api/health',
  '/api/models',
];

/**
 * 检查请求是否携带有效的 Bearer token。
 * 仅在环境变量 API_SECRET 已设置时生效；未设置则跳过认证（开发模式）。
 */
function isAuthenticated(request: NextRequest): boolean {
  const apiSecret = process.env.API_SECRET;
  if (!apiSecret) return true; // 未配置密钥时放行

  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;

  // 支持 "Bearer <token>" 格式
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer' && parts[1] === apiSecret) {
    return true;
  }

  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ---- 安全响应头 ----
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  // SAMEORIGIN 而非 DENY：允许同源 iframe 预览生成的应用
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // ---- API 认证保护 ----
  if (!PUBLIC_PATHS.includes(pathname) && !isAuthenticated(request)) {
    return NextResponse.json(
      { error: '未授权访问，请提供有效的 API 密钥。' },
      { status: 401 },
    );
  }

  // ---- 对 /api/chat 进行速率限制 ----
  if (pathname === '/api/chat') {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown';
    const now = Date.now();

    let entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    }

    entry.count++;
    rateLimitMap.set(ip, entry);

    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
    response.headers.set(
      'X-RateLimit-Remaining',
      String(Math.max(0, RATE_LIMIT_MAX - entry.count)),
    );

    if (entry.count > RATE_LIMIT_MAX) {
      return new Response(
        JSON.stringify({ error: '请求过于频繁，请稍后再试。' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
          },
        },
      );
    }
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
