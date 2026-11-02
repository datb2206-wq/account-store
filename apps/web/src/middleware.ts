import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, verifyAccessToken } from '@/lib/jwt';

// Middleware chạy ở Edge: chỉ kiểm tra chữ ký JWT (nhanh, không đụng DB).
// Kiểm tra quyền "thật" (status, role mới nhất) nằm ở requireUser/requireStaff trong layout.
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  const session = token ? await verifyAccessToken(token) : null;

  if (pathname === '/login' || pathname === '/register') {
    if (!session) return NextResponse.next();
    return NextResponse.redirect(new URL(session.role === 'USER' ? '/dashboard' : '/admin', req.url));
  }

  if (!session) {
    // Access token hết hạn/không có -> thử refresh, thất bại thì route refresh tự đẩy về /login
    const refreshUrl = new URL('/api/auth/refresh', req.url);
    refreshUrl.searchParams.set('next', pathname + search);
    return NextResponse.redirect(refreshUrl);
  }

  if (pathname.startsWith('/admin') && session.role === 'USER') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/login', '/register'],
};
