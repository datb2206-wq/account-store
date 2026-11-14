import type { Metadata } from 'next';
import Link from 'next/link';
import { Prisma, prisma } from '@accszone/database';
import { MiniStat, PageHeader, Panel } from '@/components/admin/ui';
import { BoxIcon, CartIcon, CoinIcon, WalletIcon } from '@/components/icons';
import { NET_REVENUE, ORDER_COST, ORDER_REFUNDS_JOIN, periodStarts, vnDayRange, vnParts } from '@/lib/admin-stats';
import { requireStaff } from '@/lib/auth';
import { formatUsd, localized } from '@/lib/format';
import { buildHref } from '@/lib/url';

export const metadata: Metadata = { title: 'Báo cáo lãi & bán chạy' };

const SORTS = { profit: 'Lãi', revenue: 'Doanh thu', qty: 'Số lượng' } as const;
type Sort = keyof typeof SORTS;
const DAY_MS = 86_400_000;

const ymd = (d: Date) => {
  const p = vnParts(d);
  return `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};

type ProductRow = { productId: string; orders: number; qty: number; revenue: string; cost: string; nocost: number };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; sort?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const starts = periodStarts();
  const today = ymd(new Date());
  const from = sp.from ?? ymd(new Date(starts.today.getTime() - 29 * DAY_MS));
  const to = sp.to ?? today;
  const range = vnDayRange(from, to);
  const gte = range?.gte ?? new Date(0);
  const lt = range?.lt ?? new Date(Date.now() + DAY_MS);
  const sort: Sort = sp.sort && sp.sort in SORTS ? (sp.sort as Sort) : 'profit';

  const [rows, buyers] = await Promise.all([
    prisma.$queryRaw<ProductRow[]>(Prisma.sql`
      SELECT o."productId", count(*)::int AS orders, sum(o.quantity)::int AS qty,
             sum(${NET_REVENUE})::text AS revenue, sum(${ORDER_COST})::text AS cost,
             count(*) FILTER (WHERE coalesce(o."unitCost", p."costPrice") IS NULL)::int AS nocost
      FROM orders o JOIN products p ON p.id = o."productId" ${ORDER_REFUNDS_JOIN}
      WHERE o.status = 'COMPLETED' AND o."createdAt" >= ${gte} AND o."createdAt" < ${lt}
      GROUP BY o."productId"`),
    prisma.$queryRaw<{ userId: string; orders: number; revenue: string }[]>(Prisma.sql`
      SELECT o."userId", count(*)::int AS orders, sum(${NET_REVENUE})::text AS revenue
      FROM orders o ${ORDER_REFUNDS_JOIN}
      WHERE o.status = 'COMPLETED' AND o."createdAt" >= ${gte} AND o."createdAt" < ${lt}
      GROUP BY o."userId" ORDER BY 3 DESC LIMIT 10`),
  ]);
  const [products, users] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: rows.map((r) => r.productId) } }, select: { id: true, name: true, source: true, supplier: { select: { name: true } } } }),
    prisma.user.findMany({ where: { id: { in: buyers.map((b) => b.userId) } }, select: { id: true, email: true } }),
  ]);
  const productMap = new Map(products.map((p) => [p.id, p]));
  const email = new Map(users.map((u) => [u.id, u.email]));

  const items = rows.map((r) => {
    const revenue = new Prisma.Decimal(r.revenue);
    const cost = new Prisma.Decimal(r.cost);
    return { ...r, revenue, cost, profit: revenue.sub(cost) };
  });
  const key = { profit: (i: (typeof items)[number]) => i.profit.toNumber(), revenue: (i: (typeof items)[number]) => i.revenue.toNumber(), qty: (i: (typeof items)[number]) => i.qty }[sort];
  items.sort((a, b) => key(b) - key(a));

  const sum = items.reduce(
    (s, i) => ({ orders: s.orders + i.orders, qty: s.qty + i.qty, revenue: s.revenue.add(i.revenue), cost: s.cost.add(i.cost), nocost: s.nocost + i.nocost }),
    { orders: 0, qty: 0, revenue: new Prisma.Decimal(0), cost: new Prisma.Decimal(0), nocost: 0 },
  );
  const profit = sum.revenue.sub(sum.cost);
  const margin = sum.revenue.isZero() ? 0 : profit.div(sum.revenue).mul(100).toNumber();

  const presets = [
    { label: 'Hôm nay', from: today, to: today },
    { label: '7 ngày', from: ymd(new Date(starts.today.getTime() - 6 * DAY_MS)), to: today },
    { label: '30 ngày', from: ymd(new Date(starts.today.getTime() - 29 * DAY_MS)), to: today },
    { label: 'Tháng này', from: ymd(starts.month), to: today },
    { label: 'Tất cả', from: '2000-01-01', to: today },
  ];
  const href = (o: { from?: string; to?: string; sort?: Sort }) => buildHref('/admin/reports', { from, to, sort: sort === 'profit' ? undefined : sort, ...o });

  return (
    <div className="space-y-5">
      <PageHeader title="Báo cáo lãi & bán chạy" />

      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <Link key={p.label} href={href({ from: p.from, to: p.to })} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${p.from === from && p.to === to ? 'bg-indigo-500 text-white' : 'bg-white text-zinc-600 hover:bg-zinc-100'}`}>
            {p.label}
          </Link>
        ))}
        <form className="ml-auto flex flex-wrap items-center gap-2">
          <input type="date" name="from" defaultValue={from} className="input w-40" />
          <span className="text-zinc-400">→</span>
          <input type="date" name="to" defaultValue={to} className="input w-40" />
          {sort !== 'profit' && <input type="hidden" name="sort" value={sort} />}
          <button className="btn-primary">Xem</button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat tone="sky" icon={<CartIcon size={20} />} value={`${sum.orders.toLocaleString('en-US')} đơn`} label={`${sum.qty.toLocaleString('en-US')} tài khoản đã bán`} />
        <MiniStat tone="violet" icon={<WalletIcon size={20} />} value={formatUsd(sum.revenue)} label="Doanh thu thực thu" />
        <MiniStat tone="amber" icon={<BoxIcon size={20} />} value={formatUsd(sum.cost)} label="Giá vốn" />
        <MiniStat tone="emerald" icon={<CoinIcon size={20} />} value={formatUsd(profit)} label={`Lãi (biên ${margin.toFixed(1)}%)`} />
      </div>
      {sum.nocost > 0 && (
        <p className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {sum.nocost.toLocaleString('en-US')} đơn thuộc sản phẩm chưa khai giá vốn nên được tính vốn $0 (lãi cao hơn thực tế). Nhập &quot;Giá vốn&quot; trong trang sửa sản phẩm.
        </p>
      )}

      <Panel
        title="Sản phẩm bán chạy"
        bodyClassName="overflow-x-auto"
        action={
          <span className="flex gap-1 text-xs">
            Xếp theo:
            {(Object.keys(SORTS) as Sort[]).map((s) => (
              <Link key={s} href={href({ sort: s })} className={s === sort ? 'font-semibold text-indigo-600' : 'text-zinc-500 hover:text-zinc-800'}>{SORTS[s]}</Link>
            ))}
          </span>
        }
      >
        <table className="table">
          <thead><tr><th>#</th><th>Sản phẩm</th><th>Nguồn</th><th className="text-right">Đơn</th><th className="text-right">Số lượng</th><th className="text-right">Doanh thu</th><th className="text-right">Giá vốn</th><th className="text-right">Lãi</th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-zinc-400">Không có đơn hoàn tất trong khoảng này</td></tr>}
            {items.slice(0, 100).map((i, n) => {
              const p = productMap.get(i.productId);
              return (
                <tr key={i.productId} className="odd:bg-zinc-50/60">
                  <td className="text-zinc-400 tabular-nums">{n + 1}</td>
                  <td className="max-w-md">
                    <Link href={`/admin/products/${i.productId}`} className="font-medium text-zinc-800 hover:text-indigo-600">{p ? localized(p.name) : i.productId}</Link>
                    {i.nocost > 0 && <span className="ml-1 text-[11px] text-amber-600" title="Chưa khai giá vốn">· chưa có giá vốn</span>}
                  </td>
                  <td className="text-xs text-zinc-500">{p?.source === 'RESELLER' ? (p.supplier?.name ?? 'API') : 'Kho'}</td>
                  <td className="text-right tabular-nums">{i.orders.toLocaleString('en-US')}</td>
                  <td className="text-right tabular-nums">{i.qty.toLocaleString('en-US')}</td>
                  <td className="text-right tabular-nums">{formatUsd(i.revenue)}</td>
                  <td className="text-right text-zinc-500 tabular-nums">{formatUsd(i.cost)}</td>
                  <td className={`text-right font-semibold tabular-nums ${i.profit.isNegative() ? 'text-red-600' : 'text-emerald-600'}`}>{formatUsd(i.profit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <Panel title="Khách mua nhiều nhất" bodyClassName="overflow-x-auto">
        <table className="table">
          <thead><tr><th>#</th><th>Khách</th><th className="text-right">Đơn</th><th className="text-right">Đã chi</th></tr></thead>
          <tbody>
            {buyers.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-zinc-400">—</td></tr>}
            {buyers.map((b, n) => (
              <tr key={b.userId} className="odd:bg-zinc-50/60">
                <td className="text-zinc-400 tabular-nums">{n + 1}</td>
                <td><Link href={buildHref('/admin/users', { q: email.get(b.userId) })} className="text-indigo-600 hover:underline">{email.get(b.userId) ?? b.userId}</Link></td>
                <td className="text-right tabular-nums">{b.orders.toLocaleString('en-US')}</td>
                <td className="text-right font-medium tabular-nums">{formatUsd(b.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
