import type { NextRequest } from 'next/server';
import { prisma } from '@accszone/database';
import { apiFail, apiOk, authApi } from '@/lib/api-keys';
import { API_VISIBLE, apiLocale, PRODUCT_API_SELECT, toApiProducts } from '@/lib/public-api';

// GET /api/v1/products/<id|slug> — chi tiết 1 sản phẩm (kèm mô tả, tồn kho)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authApi(req);
  if ('res' in auth) return auth.res;
  const id = (await params).id.slice(0, 200);
  const row = await prisma.product.findFirst({ where: { ...API_VISIBLE, OR: [{ id }, { slug: id }] }, select: PRODUCT_API_SELECT });
  if (!row) return apiFail(404, 'Product not found');
  const [product] = await toApiProducts([row], await apiLocale(req.nextUrl.searchParams.get('lang')), true);
  return apiOk(product);
}
