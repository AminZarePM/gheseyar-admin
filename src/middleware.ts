import { NextResponse, type NextRequest } from 'next/server';

/**
 * نگهبان مسیر پنل.
 *
 * بررسی نهایی نشست سمت سرور در هر route انجام می‌شود؛ این لایه فقط جلوی
 * رندر شدن صفحهٔ پنل برای کسی که کوکی ندارد را می‌گیرد تا کاربر به‌جای
 * دیدن یک صفحهٔ خالی و بعد ۴۰۳، مستقیم به فرم ورود برود.
 */
const PUBLIC = ['/login', '/api/auth/login', '/api/auth/otp', '/api/auth/config', '/api/auth/logout'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next();

  // مسیرهای job با رمز مشترک از cron صدا زده می‌شوند
  if (req.headers.get('x-cron-secret')) return NextResponse.next();

  if (!req.cookies.get('gy_admin')) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|fonts|favicon.ico|logo-bird.png).*)'],
};
