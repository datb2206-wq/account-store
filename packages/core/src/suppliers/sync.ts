// Đồng bộ catalog từ nhà cung cấp -> Category/Product (source = RESELLER).
// Nguyên tắc:
//  - Sản phẩm MỚI tạo ở trạng thái ẨN (isActive = false): admin xem giá rồi mới bật bán.
//  - Giá bán luôn = giá vốn × priceMarkup của nhà cung cấp (đổi markup để chỉnh giá hàng loạt).
//  - Không ghi đè tên/mô tả/danh mục admin đã sửa; chỉ cập nhật giá, tồn kho, min/max.
//  - Sản phẩm biến mất khỏi catalog -> externalStock = 0 (không xóa: có thể đã có đơn hàng).
import { createHash } from 'node:crypto';
import { Prisma, prisma } from '@accszone/database';
import { decrypt } from '../crypto';
import { slugify } from '../slugify';
import { getAdapter } from './adapters';

export interface SyncResult {
  supplier: string;
  fetched: number;
  categoriesCreated: number;
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
    const created = await prisma.category.create({
      data: {
        supplierId,
        externalId,
        slug: stableSlug(name, supplierId, `cat:${externalId}`),
        name: { en: name },
        description: {},
        parentId: categoryIds.get(parentOf.get(externalId) ?? '') ?? null,
      },
      select: { id: true },
    });
    categoryIds.set(externalId, created.id);
    result.categoriesCreated++;
  }

  // ---- Sản phẩm ----
  const existing = await prisma.product.findMany({
    where: { supplierId },
    select: { id: true, externalId: true },
  });
  const productIds = new Map(existing.map((p) => [p.externalId!, p.id]));
  const markup = supplier.priceMarkup;
  const now = new Date();

  for (const item of catalog.products) {
    const cost = new Prisma.Decimal(item.cost);
    // Làm tròn LÊN 4 chữ số: không bao giờ bán thấp hơn giá vốn × markup
    const price = cost.mul(markup.toString()).toDecimalPlaces(4, Prisma.Decimal.ROUND_UP);
    const common = {
      costPrice: cost.toFixed(6),
      price: price.toFixed(6),
      externalStock: item.stock,
      minQty: item.minQty,
      maxQty: item.maxQty,
      lastSyncedAt: now,
    };

    const id = productIds.get(item.externalId);
    if (id) {
      await prisma.product.update({ where: { id }, data: common });
      productIds.delete(item.externalId);
      result.productsUpdated++;
    } else {
      await prisma.product.create({
        data: {
          ...common,
          supplierId,
          externalId: item.externalId,
          source: 'RESELLER',
          isActive: false,
          slug: stableSlug(item.name, supplierId, item.externalId),
          categoryId: categoryIds.get(item.category?.externalId ?? fallbackKey)!,
          name: { en: item.name },
          description: item.description ? { en: item.description } : {},
        },
      });
      result.productsCreated++;
    }
  }

  // Còn lại trong map = không còn trong catalog
  if (productIds.size > 0) {
    const res = await prisma.product.updateMany({
      where: { id: { in: [...productIds.values()] } },
      data: { externalStock: 0, lastSyncedAt: now },
    });
    result.productsMissing = res.count;
  }

  await prisma.supplier.update({ where: { id: supplierId }, data: { lastSyncAt: now } });
  result.durationMs = Date.now() - started;
  return result;
}
