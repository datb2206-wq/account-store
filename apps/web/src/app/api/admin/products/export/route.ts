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
const clean = (s: string) => s.replace(/\r\n?/g, '\n').trim();
const money = (v: unknown) => (v == null ? '' : Number(v).toFixed(4));

// Xuất danh sách sản phẩm ra CSV (mở bằng Excel / Google Sheets), theo đúng bộ lọc đang xem
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
    : productWhere({ q: sp.get('q')?.trim() ?? '', category: sp.get('category') ?? '', status: ['active', 'inactive', 'featured'].includes(status) ? status : '' });

  const [products, rates] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      take: 20_000,
      include: { category: { select: { name: true } }, seller: { select: { shopName: true } }, supplier: { select: { name: true } } },
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

  const header = [
    'id', 'slug', 'chuyen_muc', 'ten_goc', 'ten_tieng_bo', 'mo_ta_goc', 'mo_ta_tieng_bo', 'trang_thai', 'noi_bat', 'thu_tu',
    'gia_ban_usd', 'gia_von_usd', 'lai_usd', 'gia_ban_brl', 'ton_kho', 'da_ban', 'nguon', 'khoa_ban_dich', 'ngay_tao',
  ];
  const lines = [header.join(',')];
  for (const p of products) {
    const cat = asMap(p.category?.name);
    const inStock = p.source === 'LOCAL' ? (available.get(p.id) ?? 0) : (p.externalStock ?? 0);
    const margin = p.costPrice != null ? Number(p.price) - Number(p.costPrice) : null;
    lines.push(
      [
        p.id,
        p.slug,
        cat.pt || cat.src || cat.en || '',
        srcOf(p.name),
        asMap(p.name).pt ?? '',
        clean(srcOf(p.description)),
        clean(asMap(p.description).pt ?? ''),
        p.isActive ? 'Đang bán' : 'Đã ẩn',
        p.isFeatured ? 'Có' : '',
        String(p.sortOrder ?? 0),
        money(p.price),
        money(p.costPrice),
        margin == null ? '' : margin.toFixed(4),
        brl > 0 ? (Number(p.price) * brl).toFixed(2) : '',
        String(inStock),
        String(sold.get(p.id) ?? 0),
        p.seller ? `CTV · ${p.seller.shopName}` : p.source === 'RESELLER' ? `API · ${p.supplier?.name ?? 'đã xóa'}` : 'Admin',
        asMap(p.name).lock ? 'Có' : '',
        p.createdAt.toISOString().slice(0, 16).replace('T', ' '),
      ]
        .map((v) => csvCell(String(v)))
        .join(','),
    );
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
