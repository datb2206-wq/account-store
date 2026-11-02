import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, badRequest, notFound, parseBody } from '@/lib/admin-route';
import { stockImportSchema } from '@/lib/admin-schemas';
import { writeAudit } from '@/lib/audit';
import { invalidateCache, SHOP_STOCK_CACHE } from '@/lib/cache';
import { contentHash, encrypt, newImportBatchCode } from '@accszone/core';
import { getClientIp } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

const MAX_LINES = 10_000;
const MAX_LINE_LENGTH = 2_000;
const CHUNK = 1_000;

// Nhập kho: mỗi dòng = 1 tài khoản. Mã hóa AES-256-GCM từng dòng, chống trùng bằng contentHash.
export const POST = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const { content } = await parseBody(req, stockImportSchema);

  const product = await prisma.product.findUnique({ where: { id }, select: { id: true, source: true } });
  if (!product) throw notFound('Sản phẩm không tồn tại');
  if (product.source !== 'LOCAL') throw badRequest('Sản phẩm RESELLER lấy hàng từ web gốc, không nhập kho tay được');

  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) throw badRequest('Không có dòng dữ liệu nào', { content: ['Không có dòng dữ liệu nào'] });
  if (lines.length > MAX_LINES) {
    throw badRequest(`Tối đa ${MAX_LINES.toLocaleString()} dòng mỗi lần nhập (đang có ${lines.length.toLocaleString()})`);
  }
  const tooLong = lines.findIndex((l) => l.length > MAX_LINE_LENGTH);
  if (tooLong !== -1) throw badRequest(`Dòng ${tooLong + 1} dài quá ${MAX_LINE_LENGTH} ký tự`);

  // Loại trùng ngay trong dữ liệu dán vào
  const unique = new Map<string, string>();
  for (const line of lines) {
    const hash = contentHash(line);
    if (!unique.has(hash)) unique.set(hash, line);
  }

  const batch = newImportBatchCode();
  const rows = [...unique].map(([hash, line]) => ({
    productId: id,
    content: encrypt(line),
    contentHash: hash,
    importBatch: batch,
  }));

  // skipDuplicates: dòng đã có trong kho (trùng @@unique[productId, contentHash]) bị bỏ qua.
  // Chạy trong 1 transaction: lỗi giữa chừng thì không có lô nhập dở dang.
  const imported = await prisma.$transaction(
    async (tx) => {
      let count = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const res = await tx.stockItem.createMany({ data: rows.slice(i, i + CHUNK), skipDuplicates: true });
        count += res.count;
      }
      return count;
    },
    { timeout: 60_000 },
  );

  await invalidateCache(SHOP_STOCK_CACHE);

  const result = {
    batch,
    total: lines.length,
    imported,
    duplicateInInput: lines.length - unique.size,
    duplicateInStock: unique.size - imported,
  };
  await writeAudit({
    actorId: user.id,
    action: 'stock.import',
    entity: 'Product',
    entityId: id,
    after: result,
    ip: getClientIp(req),
  });
  return NextResponse.json(result, { status: 201 });
});
