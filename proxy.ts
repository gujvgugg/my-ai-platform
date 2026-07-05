import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 简单的内存级速率限制器（按 IP）
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 30; // 请求数
const RATE_LIMIT_WINDOW = 60_000; // 1 分钟（毫秒）

export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  // 安全响应头
  response.headers.set('X-Content-Type-Options', 'nosniff');
  // SAMEORIGIN 而非 DENY：允许同源 iframe 预览生成的应用
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // 对 /api/chat 进行速率限制
  if (request.nextUrl.pathname === '/api/chat') {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const now = Date.now();

    let entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    }

    entry.count++;
    rateLimitMap.set(ip, entry);

    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
    response.headers.set('X-RateLimit-Remaining', String(Math.max(0, RATE_LIMIT_MAX - entry.count)));

    if (entry.count > RATE_LIMIT_MAX) {
      return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试。' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60',
        },
      });
    }
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
