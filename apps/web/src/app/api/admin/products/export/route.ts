import { NextResponse } from 'next/server';
import { getConfig } from '@accszone/core';
import { prisma } from '@accszone/database';
import { adminRoute } from '@/lib/admin-route';
import { productWhere } from '@/lib/admin-products';
import { writeAudit } from '@/lib/audit';
import { csvCell } from '@/lib/csv';
import { getClientIp } from '@/lib/http';

const asMap = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {});
const srcOf = (v: unknown) => {
  const m = asMap(v);
  return m.src ?? m.en ?? '';
};
const catName = (v: unknown) => {
  const m = asMap(v);
  return m.src || m.vi || m.en || m.pt || '';
};
const clean = (s: string) => s.replace(/\r\n?/g, '\n').trim();
const usd = (v: unknown) => (v == null ? '' : Number(v).toFixed(4));
// Giờ Việt Nam (UTC+7), dạng 26/11/2026 16:20
const vnTime = (d: Date | null | undefined) => {
  if (!d) return '';
  const t = new Date(d.getTime() + 7 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(t.getUTCDate())}/${p(t.getUTCMonth() + 1)}/${t.getUTCFullYear()} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
};
const APPROVAL = { APPROVED: 'Đã duyệt', PENDING: 'Chờ duyệt', REJECTED: 'Từ chối' } as const;

// Tiêu đề cột ghi rõ nội dung (tiếng Việt) + đơn vị tiền
const HEADER = [
  'ID sản phẩm',
  'Slug (đường dẫn)',
  'Chuyên mục cha',
  'Chuyên mục',
  'Chuyên mục (tiếng Bồ - khách thấy)',
  'Tên gốc (từ nguồn)',
  'Tên tiếng Bồ (khách thấy)',
  'Tên tiếng Anh',
  'Mô tả gốc (từ nguồn)',
  'Mô tả tiếng Bồ (khách thấy)',
  'Trạng thái',
  'Lý do ẩn',
  'Duyệt (sản phẩm CTV)',
  'Nổi bật (ghim)',
  'Thứ tự ưu tiên',
  'Giá bán (USD)',
  'Giá bán (R$)',
  'Giá vốn (USD)',
  'Lãi / 1 sản phẩm (USD)',
  'Lãi (%)',
  'Mua tối thiểu',
  'Mua tối đa',
  'Tồn kho hiện có',
  'Loại kho',
  'Đã bán (đơn hoàn tất)',
  'Số đã bán khởi điểm (cộng thêm khi hiển thị)',
  'Nguồn hàng',
  'Tên nguồn / người bán',
  'ID sản phẩm bên web nguồn',
  'Đồng bộ nguồn lần cuối (giờ VN)',
  'Bản dịch đã khóa',
  'Ngày tạo (giờ VN)',
  'Cập nhật lần cuối (giờ VN)',
];

// Xuất danh sách sản phẩm ra CSV (Excel / Google Sheets), theo đúng bộ lọc đang xem
// hoặc các sản phẩm đã tích chọn (?ids=a,b,c). Chỉ đọc, không đổi gì trên web.
export const GET = adminRoute(async (req, _ctx, user) => {
  const sp = req.nextUrl.searchParams;
  const ids = (sp.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9]{10,40}$/.test(s))
    .slice(0, 20_000);
  const status = sp.get('status') ?? '';
  const where = ids.length
    ? { id: { in: ids } }
    : productWhere({ q: sp.get('q')?.trim() ?? '', category: sp.get('category') ?? '', status: ['active', 'inactive', 'featured'].includes(status) ? status : '', supplier: sp.get('supplier')?.trim().slice(0, 50) ?? '' });

  const [products, rates] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      take: 20_000,
      include: {
        category: { select: { name: true, parent: { select: { name: true } } } },
        seller: { select: { shopName: true } },
        supplier: { select: { name: true } },
      },
    }),
    getConfig('currency.rates'),
  ]);
  const pids = products.map((p) => p.id);
  const [stock, soldRows] = await Promise.all([
    prisma.stockItem.groupBy({ by: ['productId'], where: { productId: { in: pids }, status: 'AVAILABLE' }, _count: true }),
    prisma.order.groupBy({ by: ['productId'], where: { productId: { in: pids }, status: 'COMPLETED' }, _sum: { quantity: true } }),
  ]);
  const available = new Map(stock.map((s) => [s.productId, s._count]));
  const sold = new Map(soldRows.map((r) => [r.productId, r._sum.quantity ?? 0]));
  const brl = Number(rates?.BRL ?? 0);

  const lines = [HEADER.map(csvCell).join(',')];
  for (const p of products) {
    const local = p.source === 'LOCAL';
    const inStock = local ? (available.get(p.id) ?? 0) : (p.externalStock ?? 0);
    const price = Number(p.price);
    const cost = p.costPrice != null ? Number(p.costPrice) : null;
    const margin = cost != null ? price - cost : null;
    const name = asMap(p.name);
    const cat = asMap(p.category?.name);
    const row = [
      p.id,
      p.slug,
      catName(p.category?.parent?.name),
      catName(p.category?.name),
      cat.pt ?? '',
      srcOf(p.name),
      name.pt ?? '',
      name.src ? (name.en ?? '') : '', // không có 'src' thì 'en' chính là tên gốc, không phải bản dịch
      clean(srcOf(p.description)),
      clean(asMap(p.description).pt ?? ''),
      p.isActive ? 'Đang bán' : 'Đã ẩn',
      p.isActive ? '' : p.autoHidden ? 'Tự ẩn vì nguồn hết hàng (có hàng lại sẽ tự bật)' : 'Admin tắt',
      p.sellerId ? APPROVAL[p.approval] : '',
      p.isFeatured ? 'Có' : 'Không',
      String(p.sortOrder ?? 0),
      usd(p.price),
      brl > 0 ? (price * brl).toFixed(2) : '',
      usd(p.costPrice),
      margin == null ? '' : margin.toFixed(4),
      margin == null || !cost ? '' : `${((margin / cost) * 100).toFixed(1)}%`,
      String(p.minQty),
      String(p.maxQty),
      String(inStock),
      local ? 'Kho web (tự nhập)' : 'Kho web nguồn (API)',
      String(sold.get(p.id) ?? 0),
      String(p.baseSold ?? 0),
      p.seller ? 'CTV (người bán)' : local ? 'Admin tự nhập' : 'API web nguồn',
      p.seller ? p.seller.shopName : local ? '' : (p.supplier?.name ?? 'Kết nối đã xóa'),
      p.externalId ?? '',
      vnTime(p.lastSyncedAt),
      name.lock ? 'Có' : 'Không',
      vnTime(p.createdAt),
      vnTime(p.updatedAt),
    ];
    lines.push(row.map((v) => csvCell(String(v))).join(','));
  }
  await writeAudit({ actorId: user.id, action: 'product.export', entity: 'Product', after: { count: products.length, ids: ids.length || undefined }, ip: getClientIp(req) });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${lines.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="san-pham-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});

export const maxDuration = 120;
