import type { NextRequest } from 'next/server';
import { prisma } from '@accszone/database';
import { apiOk, authApi } from '@/lib/api-keys';
import { localized } from '@/lib/format';
import { API_VISIBLE, apiLocale } from '@/lib/public-api';

// GET /api/v1/categories — danh mục đang bán (kèm số sản phẩm), parent_id = danh mục cha
export async function GET(req: NextRequest) {
  const auth = await authApi(req);
  if ('res' in auth) return auth.res;
  const locale = await apiLocale(req.nextUrl.searchParams.get('lang'));
  const [cats, counts] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, select: { id: true, slug: true, name: true, parentId: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    prisma.product.groupBy({ by: ['categoryId'], where: API_VISIBLE, _count: { _all: true } }),
  ]);
  const count = new Map(counts.map((c) => [c.categoryId, c._count._all]));
  return apiOk(cats.map((c) => ({ id: c.id, slug: c.slug, name: localized(c.name, locale), parent_id: c.parentId, products: count.get(c.id) ?? 0 })));
}
