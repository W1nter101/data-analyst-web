import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from './lib/rateLimiter';

export const runtime = 'nodejs';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  const ip = (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1'
  );

  let limit = 120;
  let windowSec = 60;

  if (pathname.startsWith('/api/chat')) {
    limit = 15;
    windowSec = 60;
  } else if (pathname.startsWith('/api/job')) {
    limit = 120;
    windowSec = 60;
  }

  const { allowed, remaining, resetIn } = await rateLimit(ip, limit, windowSec);

  if (!allowed) {
    return NextResponse.json(
      { error: `Quá nhiều yêu cầu. Vui lòng thử lại sau ${resetIn} giây.` },
      {
        status: 429,
        headers: {
          'Retry-After': String(resetIn),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  return response;
}

export const config = {
  matcher: ['/api/chat', '/api/job/:path*'],
};
