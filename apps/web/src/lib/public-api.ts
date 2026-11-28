// Dữ liệu cho API công khai /api/v1 (khách mua qua API key). Cùng điều kiện hiển thị / mua như trang web.
import { prisma, type Prisma } from '@accszone/database';
import { isLocale } from '@/i18n/config';
import { localized } from './format';
import { getLanguages } from './languages';

export const API_VISIBLE: Prisma.ProductWhereInput = {
  isActive: true,
  approval: 'APPROVED',
  category: { isActive: true },
  AND: [{ OR: [{ sellerId: null }, { seller: { status: 'ACTIVE' } }] }, { OR: [{ source: 'LOCAL' }, { supplier: { isActive: true } }] }],
};

export const PRODUCT_API_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  price: true,
  minQty: true,
  maxQty: true,
  source: true,
  externalStock: true,
  category: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.ProductSelect;

type ApiProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_API_SELECT }>;

async function stockMap(rows: { id: string; source: string; externalStock: number | null }[]) {
  const local = rows.filter((p) => p.source === 'LOCAL').map((p) => p.id);
  const grouped = local.length ? await prisma.stockItem.groupBy({ by: ['productId'], where: { productId: { in: local }, status: 'AVAILABLE' }, _count: { _all: true } }) : [];
  const map = new Map(grouped.map((r) => [r.productId, r._count._all]));
  return new Map(rows.map((p) => [p.id, p.source === 'LOCAL' ? (map.get(p.id) ?? 0) : Math.max(p.externalStock ?? 0, 0)]));
}

const plain = (html: string) => html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();

export async function toApiProducts(rows: ApiProductRow[], locale: string, withDescription = false) {
  const stock = await stockMap(rows);
  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: localized(p.name, locale),
    ...(withDescription && { description: plain(localized(p.description, locale)) }),
    price: p.price.toString(),
    currency: 'USD',
    stock: stock.get(p.id) ?? 0,
    min_quantity: p.minQty,
    max_quantity: p.maxQty,
    category: { id: p.category.id, slug: p.category.slug, name: localized(p.category.name, locale) },
  }));
}

// ?lang=pt|en|... ; không có thì dùng ngôn ngữ mặc định của web (Admin > Ngôn ngữ)
export async function apiLocale(raw: string | null) {
  if (isLocale(raw)) return raw;
  return (await getLanguages().catch(() => null))?.defaultLocale ?? 'en';
}
