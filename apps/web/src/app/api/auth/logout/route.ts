import { NextResponse, type NextRequest } from 'next/server';
import { clearAuthCookies, revokeSession } from '@/lib/auth';
import { REFRESH_COOKIE } from '@/lib/jwt';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(REFRESH_COOKIE)?.value;
  if (token) await revokeSession(token);

  const res = NextResponse.json({ ok: true });
  clearAuthCookies(res);
  return res;
}
