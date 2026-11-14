import { z } from 'zod';
import { contentHash, encrypt, getCtvSettings, newImportBatchCode, randomCode } from '@accszone/core';
import { prisma } from '@accszone/database';
import { apiError, badRequest } from './admin-route';
import { invalidateCache, SHOP_STOCK_CACHE } from './cache';

// CTV đang hoạt động của user hiện tại; không phải -> 403 (dùng trong API /api/seller/*)
export async function requireActiveSeller(userId: string) {
  const [s, seller] = await Promise.all([getCtvSettings(), prisma.seller.findUnique({ where: { userId } })]);
  if (!s.enabled || !seller || seller.status !== 'ACTIVE') throw apiError(403, 'Your seller account is not active');
  return { seller, settings: s };
}

// Sản phẩm phải thuộc CTV này
export async function sellerProduct(sellerId: string, productId: string) {
  const p = await prisma.product.findFirst({ where: { id: productId, sellerId } });
  if (!p) throw apiError(404, 'Product not found');
  return p;
}

export const sellerProductSchema = z
  .object({
    name: z.string().trim().min(3, 'Name must be at least 3 characters').max(200),
    description: z.string().trim().max(5000).default(''),
    categoryId: z.string().min(1).max(50),
    price: z.coerce.number().min(0.01, 'Price must be at least $0.01').max(100_000),
    minQty: z.coerce.number().int().min(1).max(10_000).default(1),
    maxQty: z.coerce.number().int().min(1).max(100_000).default(1000),
    isActive: z.boolean().default(true),
  })
  .refine((d) => d.maxQty >= d.minQty, { message: 'Max quantity must be ≥ min quantity', path: ['maxQty'] });

export function sellerSlug(name: string) {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'item'}-${randomCode(5).toLowerCase()}`;
}

const MAX_LINES = 10_000;
const MAX_LINE_LENGTH = 2_000;
const CHUNK = 1_000;

// Nhập kho cho sản phẩm CTV: mỗi dòng 1 tài khoản, mã hóa AES-256-GCM, chống trùng bằng contentHash
export async function importStockLines(productId: string, content: string) {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) throw badRequest('Paste at least one line');
  if (lines.length > MAX_LINES) throw badRequest(`Maximum ${MAX_LINES.toLocaleString('en-US')} lines per import`);
  if (lines.some((l) => l.length > MAX_LINE_LENGTH)) throw badRequest(`Each line must be at most ${MAX_LINE_LENGTH} characters`);

  const unique = new Map<string, string>();
  for (const line of lines) {
    const hash = contentHash(line);
    if (!unique.has(hash)) unique.set(hash, line);
  }
  const batch = newImportBatchCode();
  const rows = [...unique].map(([hash, line]) => ({ productId, content: encrypt(line), contentHash: hash, importBatch: batch }));
  const imported = await prisma.$transaction(
    async (tx) => {
      let count = 0;
      for (let i = 0; i < rows.length; i += CHUNK) count += (await tx.stockItem.createMany({ data: rows.slice(i, i + CHUNK), skipDuplicates: true })).count;
      return count;
    },
    { timeout: 60_000 },
  );
  await invalidateCache(SHOP_STOCK_CACHE);
  return { batch, total: lines.length, imported, duplicates: lines.length - imported };
}
