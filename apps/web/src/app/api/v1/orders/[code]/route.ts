import type { NextRequest } from 'next/server';
import { apiFail, apiOk, authApi } from '@/lib/api-keys';
import { apiLocale } from '@/lib/public-api';
import { getOrderForUser } from '@/lib/purchase';

// GET /api/v1/orders/<mã đơn> — trạng thái + tài khoản đã giao (đơn nguồn API đang PENDING thì gọi lại sau vài giây)
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const auth = await authApi(req);
  if ('res' in auth) return auth.res;
  const code = (await params).code.slice(0, 40);
  const result = await getOrderForUser(code, auth.user.id, await apiLocale(req.nextUrl.searchParams.get('lang')));
  if (!result) return apiFail(404, 'Order not found');
  return apiOk(result);
}
