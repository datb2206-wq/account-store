import { cache } from 'react';
import { prisma } from '@accszone/database';
import { descendantIds } from './category-tree';
import { localized } from './format';

export interface MenuItem {
  slug: string;
  name: string;
  iconUrl: string | null;
  count: number;
}

// 1 khối của mega menu = 1 danh mục gốc, kèm danh mục con liệt kê bên dưới (có thể rỗng)
export interface MenuColumn extends MenuItem {
  key: string;
  items: MenuItem[];
}

export const getCategoryMenu = cache(async (locale: string) => {
  const [categories, counts] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, slug: true, name: true, parentId: true, iconUrl: true },
    }),
    prisma.product.groupBy({ by: ['categoryId'], where: { isActive: true }, _count: true }),
  ]);
  const own = new Map(counts.map((c) => [c.categoryId, c._count]));
  const ids = new Set(categories.map((c) => c.id));
  // Số sản phẩm gồm cả danh mục con, giống thanh danh mục trên trang Shop
  const countOf = (id: string) => [id, ...descendantIds(categories, id)].reduce((s, cid) => s + (own.get(cid) ?? 0), 0);
  const toItem = (c: (typeof categories)[number]): MenuItem => ({ slug: c.slug, name: localized(c.name, locale), iconUrl: c.iconUrl, count: countOf(c.id) });

  // Danh mục có cha bị ẩn (isActive=false) được coi như danh mục gốc
  const roots = categories.filter((c) => !c.parentId || !ids.has(c.parentId));

  return {
    total: categories.reduce((s, c) => s + (own.get(c.id) ?? 0), 0),
    columns: roots.map<MenuColumn>((root) => ({
      ...toItem(root),
      key: root.id,
      items: categories.filter((c) => c.parentId === root.id).map(toItem),
    })),
  };
});
