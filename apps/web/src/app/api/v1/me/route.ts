import type { NextRequest } from 'next/server';
import { apiOk, authApi } from '@/lib/api-keys';

// GET /api/v1/me — thông tin tài khoản + số dư (USD)
export async function GET(req: NextRequest) {
  const auth = await authApi(req);
  if ('res' in auth) return auth.res;
  const { user } = auth;
  return apiOk({ username: user.username, email: user.email, balance: user.balance.toString(), currency: 'USD' });
}
