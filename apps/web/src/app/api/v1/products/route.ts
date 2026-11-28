import type { NextRequest } from 'next/server';
import { prisma, type Prisma } from '@accszone/database';
import { apiOk, authApi } from '@/lib/api-keys';
import { API_VISIBLE, apiLocale, PRODUCT_API_SELECT, toApiProducts } from '@/lib/public-api';

// GET /api/v1/products?category=<id|slug>&q=<từ khóa>&in_stock=1&lang=pt
export async function GET(req: NextRequest) {
  const auth = await authApi(req);
  if ('res' in auth) return auth.res;
  const sp = req.nextUrl.searchParams;
  const locale = await apiLocale(sp.get('lang'));
  const category = sp.get('category')?.trim().slice(0, 100);
  const q = sp.get('q')?.trim().slice(0, 60);

  const and: Prisma.ProductWhereInput[] = [];
  if (category) {
    // Gồm cả danh mục con của danh mục được chọn
    const cats = await prisma.category.findMany({ where: { isActive: true }, select: { id: true, slug: true, parentId: true } });
    const root = cats.find((c) => c.id === category || c.slug === category);
    const ids = new Set<string>(root ? [root.id] : ['-']);
    for (let changed = true, i = 0; changed && i < 6; i++) {
      changed = false;
      for (const c of cats) if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) (ids.add(c.id), (changed = true));
    }
    and.push({ categoryId: { in: [...ids] } });
  }
  if (q) {
    and.push({
      OR: [
        { name: { path: [locale], string_contains: q, mode: 'insensitive' } },
        { name: { path: ['en'], string_contains: q, mode: 'insensitive' } },
        { name: { path: ['src'], string_contains: q, mode: 'insensitive' } },
        { slug: { contains: q.replace(/\s+/g, '-'), mode: 'insensitive' } },
      ],
    });
  }
  const rows = await prisma.product.findMany({
    where: { ...API_VISIBLE, AND: [...(API_VISIBLE.AND as Prisma.ProductWhereInput[]), ...and] },
    orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    take: 500,
    select: PRODUCT_API_SELECT,
  });
  let list = await toApiProducts(rows, locale);
  if (sp.get('in_stock') === '1') list = list.filter((p) => p.stock > 0);
  return apiOk(list);
}
