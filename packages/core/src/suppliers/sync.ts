// Đồng bộ catalog từ nhà cung cấp -> Category/Product (source = RESELLER).
// Nguyên tắc:
//  - Sản phẩm MỚI tạo ở trạng thái ẨN (isActive = false): admin xem giá rồi mới bật bán.
//  - Giá bán = giá vốn × priceMarkup, làm tròn LÊN theo priceRounding (đổi markup để chỉnh giá hàng loạt).
//    Tắt autoUpdatePrice -> giữ giá admin đặt, trừ khi giá đó thấp hơn giá vốn mới (tránh bán lỗ).
//  - Mặc định không ghi đè tên/mô tả/danh mục admin đã sửa; bật autoUpdateInfo thì ghi đè bản tiếng Anh theo nguồn.
//  - stripHtml: lọc thẻ HTML khỏi tên & mô tả lấy từ nguồn.
//  - Sản phẩm biến mất khỏi catalog -> externalStock = 0 (không xóa: có thể đã có đơn hàng).
//  - Danh mục nguồn trùng tên với danh mục có sẵn của shop (cùng cấp cha) -> dùng luôn danh mục đó, không tạo bản trùng.
import { createHash } from 'node:crypto';
import { Prisma, prisma } from '@accszone/database';
import { decrypt } from '../crypto';
import { slugify } from '../slugify';
import { htmlToText } from './accszone-adapter';
import { getAdapter } from './adapters';

export const PRICE_ROUNDINGS = ['none', '0.01', '0.1', '1'] as const;

// Giá bán = giá vốn × markup, luôn làm tròn LÊN để không bán thấp hơn mức lãi đã đặt
export function sellPrice(cost: Prisma.Decimal, markup: Prisma.Decimal | string, rounding: string) {
  const raw = cost.mul(markup.toString());
  if (rounding === 'none' || !(PRICE_ROUNDINGS as readonly string[]).includes(rounding)) {
    return raw.toDecimalPlaces(4, Prisma.Decimal.ROUND_UP);
  }
  const step = new Prisma.Decimal(rounding);
  return raw.div(step).toDecimalPlaces(0, Prisma.Decimal.ROUND_UP).mul(step);
}

export interface SyncResult {
  supplier: string;
  fetched: number;
  categoriesCreated: number;
  categoriesMatched: number;
  productsCreated: number;
  productsUpdated: number;
  productsMissing: number;
  durationMs: number;
}

// Slug duy nhất, ổn định qua các lần sync: tên + hash ngắn của (supplier, externalId)
function stableSlug(name: string, supplierId: string, externalId: string) {
  const hash = createHash('sha256').update(`${supplierId}:${externalId}`).digest('hex').slice(0, 6);
  return `${slugify(name).slice(0, 80) || 'item'}-${hash}`;
}

// Danh mục do shop tự tạo (không thuộc nhà cung cấp nào), cùng tên tiếng Anh (không phân biệt hoa thường) và cùng danh mục cha
async function findShopCategory(name: string, parentId: string | null) {
  const [row] = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM categories
    WHERE "supplierId" IS NULL AND lower(trim(name->>'en')) = lower(trim(${name})) AND "parentId" IS NOT DISTINCT FROM ${parentId}
    ORDER BY "sortOrder" ASC, "createdAt" ASC
    LIMIT 1`;
  return row?.id ?? null;
}

function asObject(v: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Prisma.JsonValue>) : {};
}

export async function syncSupplier(supplierId: string): Promise<SyncResult> {
  const started = Date.now();
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw new Error(`Supplier ${supplierId} không tồn tại`);
  if (!supplier.isActive) throw new Error(`Supplier "${supplier.name}" đang tắt`);

  const catalog = await getAdapter(supplier.adapter).fetchCatalog({ baseUrl: supplier.baseUrl, apiKey: decrypt(supplier.apiKeyEnc) });
  const result: SyncResult = {
    supplier: supplier.name,
    fetched: catalog.products.length,
    categoriesCreated: 0,
    categoriesMatched: 0,
    productsCreated: 0,
    productsUpdated: 0,
    productsMissing: 0,
    durationMs: 0,
  };

  // ---- Danh mục ----
  // Sản phẩm không có danh mục -> gom vào 1 danh mục mặc định mang tên nhà cung cấp
  const fallbackKey = '__default__';
  const wanted = new Map<string, string>([[fallbackKey, supplier.name]]);
  const parentOf = new Map<string, string>();
  for (const { category } of catalog.products) {
    if (!category) continue;
    if (category.parent) {
      wanted.set(category.parent.externalId, category.parent.name);
      parentOf.set(category.externalId, category.parent.externalId);
    }
    wanted.set(category.externalId, category.name);
  }

  const existingCats = await prisma.category.findMany({
    where: { supplierId, externalId: { in: [...wanted.keys()] } },
    select: { id: true, externalId: true },
  });
  const categoryIds = new Map(existingCats.map((c) => [c.externalId!, c.id]));
  // Danh mục cha được đưa vào `wanted` trước danh mục con nên luôn được tạo trước
  for (const [externalId, name] of wanted) {
    if (categoryIds.has(externalId)) continue;
    if (externalId === fallbackKey && !catalog.products.some((p) => !p.category)) continue;
    const parentId = categoryIds.get(parentOf.get(externalId) ?? '') ?? null;
    const local = externalId === fallbackKey ? null : await findShopCategory(name, parentId);
    if (local) {
      categoryIds.set(externalId, local);
      result.categoriesMatched++;
      continue;
    }
    const created = await prisma.category.create({
      data: {
        supplierId,
        externalId,
        slug: stableSlug(name, supplierId, `cat:${externalId}`),
        name: { en: name },
        description: {},
        parentId,
      },
      select: { id: true },
    });
    categoryIds.set(externalId, created.id);
    result.categoriesCreated++;
  }

  // ---- Sản phẩm ----
  const existing = await prisma.product.findMany({
    where: { supplierId },
    select: { id: true, externalId: true, price: true, name: true, description: true },
  });
  const products = new Map(existing.map((p) => [p.externalId!, p]));
  const clean = (s: string) => (supplier.stripHtml ? htmlToText(s) : s).trim();
  const now = new Date();

  for (const item of catalog.products) {
    const cost = new Prisma.Decimal(item.cost);
    const price = sellPrice(cost, supplier.priceMarkup, supplier.priceRounding);
    const name = clean(item.name).slice(0, 300) || item.externalId;
    const description = item.description ? clean(item.description).slice(0, 5000) : '';
    const common = {
      costPrice: cost.toFixed(6),
      externalStock: item.stock,
      minQty: item.minQty,
      maxQty: item.maxQty,
      lastSyncedAt: now,
    };

    const prev = products.get(item.externalId);
    if (prev) {
      // Tắt tự cập nhật giá: giữ giá cũ, chỉ nâng lên khi giá cũ thấp hơn giá vốn mới
      const keepPrice = !supplier.autoUpdatePrice && prev.price.gte(cost);
      await prisma.product.update({
        where: { id: prev.id },
        data: {
          ...common,
          ...(!keepPrice && { price: price.toFixed(6) }),
          ...(supplier.autoUpdateInfo && {
            name: { ...asObject(prev.name), en: name },
            description: { ...asObject(prev.description), ...(description ? { en: description } : {}) },
          }),
        },
      });
      products.delete(item.externalId);
      result.productsUpdated++;
    } else {
      await prisma.product.create({
        data: {
          ...common,
          price: price.toFixed(6),
          supplierId,
          externalId: item.externalId,
          source: 'RESELLER',
          isActive: false,
          slug: stableSlug(name, supplierId, item.externalId),
          categoryId: categoryIds.get(item.category?.externalId ?? fallbackKey)!,
          name: { en: name },
          description: description ? { en: description } : {},
        },
      });
      result.productsCreated++;
    }
  }

  // Còn lại trong map = không còn trong catalog
  if (products.size > 0) {
    const res = await prisma.product.updateMany({
      where: { id: { in: [...products.values()].map((p) => p.id) } },
      data: { externalStock: 0, lastSyncedAt: now },
    });
    result.productsMissing = res.count;
  }

  await prisma.supplier.update({ where: { id: supplierId }, data: { lastSyncAt: now } });
  result.durationMs = Date.now() - started;
  return result;
}
