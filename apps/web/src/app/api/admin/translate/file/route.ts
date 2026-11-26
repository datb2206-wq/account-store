import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getConfig } from '@accszone/core';
import { prisma } from '@accszone/database';
import { adminRoute, badRequest, parseBody } from '@/lib/admin-route';
import { translationWhere } from '@/lib/admin-products';
import { writeAudit } from '@/lib/audit';
import { csvCell, parseCsv } from '@/lib/csv';
import { getClientIp } from '@/lib/http';

// Xuất / nhập file CSV bản dịch tiếng Bồ để duyệt ngoài web (Excel, Google Sheets, Gemini...).
// Cột cố định: id | category | price_brl | raw_title | raw_bio | title_pt | bio_pt | trang_thai. Chỉ nhập title_pt, bio_pt (trang_thai chỉ để xem).
const HEADER = ['id', 'category', 'price_brl', 'raw_title (VN goc)', 'raw_bio (VN goc)', 'title_pt (sua cot nay)', 'bio_pt (sua cot nay)', 'trang_thai'];
const LOCALE = 'pt';

const asMap = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {});
const srcOf = (v: unknown) => {
  const m = asMap(v);
  return m.src ?? m.en ?? '';
};
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const clean = (s: string) => s.replace(/\r\n?/g, '\n').trim();

const productSelect = { id: true, name: true, description: true, price: true, isActive: true, autoHidden: true, category: { select: { name: true } } } as const;

// Tải file: toàn bộ sản phẩm (đang bán trước, rồi đang ẩn); ?only=pending = chỉ sản phẩm chưa duyệt / chưa khóa bản dịch
export const GET = adminRoute(async (req, _ctx, user) => {
  const pendingOnly = req.nextUrl.searchParams.get('only') === 'pending';
  const brl = Number((await getConfig('currency.rates'))?.BRL ?? 0);
  const products = await prisma.product.findMany({
    ...(pendingOnly && { where: translationWhere('pending')! }),
    select: productSelect,
    orderBy: [{ isActive: 'desc' }, { category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const lines = [HEADER.join(',')];
  for (const p of products) {
    const cat = asMap(p.category?.name);
    lines.push(
      [
        p.id,
        cat[LOCALE] || cat.src || cat.en || '',
        brl > 0 ? (Number(p.price) * brl).toFixed(2) : '',
        srcOf(p.name),
        clean(srcOf(p.description)),
        asMap(p.name)[LOCALE] ?? '',
        clean(asMap(p.description)[LOCALE] ?? ''),
        p.isActive ? 'Dang ban' : p.autoHidden ? 'An - het hang' : 'An - chua mo ban',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  await writeAudit({ actorId: user.id, action: 'translate.export', entity: 'Product', after: { count: products.length, pendingOnly } });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${lines.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ban-dich-pt-${pendingOnly ? 'chua-duyet-' : ''}${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});

const schema = z.object({
  csv: z.string().min(1).max(8_000_000),
  apply: z.boolean().default(false), // false = chỉ kiểm tra + xem trước
});

type Change = { id: string; row: number; src: string; oldName: string; newName: string | null; oldBio: string; newBio: string | null };

// Kiểm tra / nhập file: chỉ ghi dòng hợp lệ (đúng id, tên gốc khớp id = không lệch dòng) và có thay đổi; ghi xong khóa bản dịch
export const POST = adminRoute(async (req, _ctx, user) => {
  const input = await parseBody(req, schema);
  const rows = parseCsv(input.csv);
  if (rows.length < 2) throw badRequest('File trống hoặc không đúng định dạng CSV');
  const head = rows[0]!.map((h) => h.trim().toLowerCase());
  if (head[0] !== 'id' || head.length < 7) throw badRequest('Sai cột: dòng đầu phải là id, category, price_brl, raw_title, raw_bio, title_pt, bio_pt (dùng file tải từ trang này)');

  const body = rows.slice(1);
  const ids = [...new Set(body.map((r) => (r[0] ?? '').trim()).filter(Boolean))];
  const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, description: true } });
  const byId = new Map(products.map((p) => [p.id, p]));

  const errors: { row: number; id: string; reason: string }[] = [];
  const changes: Change[] = [];
  const seen = new Set<string>();
  body.forEach((r, i) => {
    const row = i + 2; // số dòng như trong Excel (dòng 1 = tiêu đề)
    const id = (r[0] ?? '').trim();
    if (r.length < 7) return errors.push({ row, id, reason: `Thiếu cột (${r.length}/7)` });
    if (!id) return errors.push({ row, id, reason: 'Thiếu id' });
    if (seen.has(id)) return errors.push({ row, id, reason: 'Trùng id' });
    seen.add(id);
    const p = byId.get(id);
    if (!p) return errors.push({ row, id, reason: 'Không có sản phẩm này trên web (đã xóa hoặc sai id)' });
    const rawTitle = r[3] ?? '';
    const src = srcOf(p.name);
    // Chống lệch dòng: tên gốc trong file phải đúng là tên gốc của id này
    if (rawTitle.trim() && src && norm(rawTitle) !== norm(src)) return errors.push({ row, id, reason: `Tên gốc không khớp id (lệch dòng?): "${rawTitle.slice(0, 60)}"` });
    const title = clean(r[5] ?? '');
    const bio = clean(r[6] ?? '');
    if (!title) return errors.push({ row, id, reason: 'Ô title_pt trống' });
    if (title.length > 300) return errors.push({ row, id, reason: 'Tên dài quá 300 ký tự' });
    const oldName = asMap(p.name)[LOCALE] ?? '';
    const oldBio = asMap(p.description)[LOCALE] ?? '';
    const tCh = norm(title) !== norm(oldName);
    const bCh = norm(bio) !== norm(oldBio);
    if (tCh || bCh) changes.push({ id, row, src, oldName, newName: tCh ? title : null, oldBio, newBio: bCh ? bio.slice(0, 5000) : null });
  });

  const summary = { rows: body.length, errors: errors.length, changes: changes.length, unchanged: body.length - errors.length - changes.length };
  if (!input.apply) return NextResponse.json({ ...summary, errorList: errors.slice(0, 300), items: changes.slice(0, 500) });

  const ops = changes.map((c) => {
    const p = byId.get(c.id)!;
    const { lock: _l, ...name } = asMap(p.name);
    return prisma.product.update({
      where: { id: c.id },
      data: {
        name: { ...name, ...(c.newName !== null && { [LOCALE]: c.newName }), lock: '1' },
        ...(c.newBio !== null && { description: { ...asMap(p.description), [LOCALE]: c.newBio } }),
      },
    });
  });
  for (let i = 0; i < ops.length; i += 200) await prisma.$transaction(ops.slice(i, i + 200));
  await writeAudit({
    actorId: user.id,
    action: 'translate.import',
    entity: 'Product',
    // Giữ bản cũ trong nhật ký để có thể khôi phục tay nếu cần
    before: { items: changes.map((c) => ({ id: c.id, name: c.oldName, description: c.oldBio })) },
    after: { ...summary, items: changes.map((c) => ({ id: c.id, name: c.newName, description: c.newBio })) },
    ip: getClientIp(req),
  });
  return NextResponse.json({ ...summary, written: changes.length });
});

export const maxDuration = 120;
