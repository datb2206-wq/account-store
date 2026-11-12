import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { AutoSelect } from '@/components/admin/auto-select';
import { BarChart } from '@/components/admin/bar-chart';
import { Panel } from '@/components/admin/ui';
import { Badge } from '@/components/badge';
import { LocalTime } from '@/components/local-time';
import { monthlySeries, periodStarts, periodStats, vnParts, type PeriodStats } from '@/lib/admin-stats';
import { requireStaff } from '@/lib/auth';
import { formatUsd, localized, METHOD_LABEL } from '@/lib/format';

export const metadata: Metadata = { title: 'Dashboard' };

const CARDS = [
  { key: 'all', gradient: 'from-[#3b82f6] to-[#2563eb]', icon: '∞' },
  { key: 'month', gradient: 'from-[#8b5cf6] to-[#6d28d9]', icon: '▦' },
  { key: 'week', gradient: 'from-[#10b981] to-[#059669]', icon: '◷' },
  { key: 'today', gradient: 'from-[#f59e0b] to-[#ea580c]', icon: '☀' },
] as const;

function PeriodCard({ title, stats, gradient, icon }: { title: string; stats: PeriodStats; gradient: string; icon: string }) {
  const cells = [
    { label: 'Thành viên mới', value: stats.users.toLocaleString('en-US') },
    { label: 'Đơn hàng', value: stats.orders.toLocaleString('en-US') },
    { label: 'Doanh thu', value: formatUsd(stats.revenue) },
    { label: 'Lợi nhuận', value: formatUsd(stats.profit) },
  ];
  return (
    <div className={`rounded-xl bg-gradient-to-br ${gradient} p-5 text-white shadow-md`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold tracking-wide uppercase">{title}</h3>
        <span className="grid size-9 place-items-center rounded-full bg-white/20 text-base">{icon}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {cells.map((c) => (
          <div key={c.label} className="rounded-lg bg-white/15 px-3 py-2.5">
            <p className="text-[11px] text-white/80">{c.label}</p>
            <p className="truncate text-lg font-bold tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireStaff();
  const now = vnParts();
  // ?m=2026-11 -> tháng cần vẽ biểu đồ (mặc định tháng hiện tại)
  const match = /^(\d{4})-(\d{2})$/.exec((await searchParams).m ?? '');
  const y = match ? Number(match[1]) : now.y;
  const m = match ? Math.min(11, Math.max(0, Number(match[2]) - 1)) : now.m;

  const starts = periodStarts();
  const [all, month, week, today, series, recentOrders, recentDeposits, pendingDeposits, totalBalance] = await Promise.all([
    periodStats(),
    periodStats(starts.month),
    periodStats(starts.week),
    periodStats(starts.today),
    monthlySeries(y, m),
    prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { code: true, quantity: true, totalAmount: true, status: true, createdAt: true, user: { select: { email: true } }, product: { select: { name: true } } },
    }),
    prisma.transaction.findMany({
      where: { type: 'DEPOSIT' },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, amount: true, method: true, status: true, createdAt: true, user: { select: { email: true } } },
    }),
    prisma.transaction.count({ where: { type: 'DEPOSIT', status: 'PENDING' } }),
    prisma.user.aggregate({ _sum: { balance: true } }),
  ]);

  const stats = { all, month, week, today };
  const titles = { all: 'Toàn thời gian', month: `Tháng ${now.m + 1}`, week: 'Tuần này', today: 'Hôm nay' };
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.y, now.m - i, 1));
    const v = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return { value: v, label: `Tháng ${d.getUTCMonth() + 1}/${d.getUTCFullYear()}` };
  });
  const selected = `${y}-${String(m + 1).padStart(2, '0')}`;
  const labels = series.map((p) => `${p.day}/${m + 1}`);
  const monthPicker = (
    <form><AutoSelect name="m" defaultValue={selected} options={monthOptions} /></form>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-zinc-800">Dashboard</h1>
        <p className="text-sm text-zinc-500">
          Số dư khách đang giữ: <b className="text-zinc-800 tabular-nums">{formatUsd(totalBalance._sum.balance)}</b>
        </p>
      </div>

      {pendingDeposits > 0 && (
        <Link
          href="/admin/transactions?type=DEPOSIT&status=PENDING"
          className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <span className="text-lg">⚠</span>
          Có <b>{pendingDeposits}</b> yêu cầu nạp tiền đang chờ duyệt. <span className="ml-auto font-semibold underline">Duyệt ngay →</span>
        </Link>
      )}

      <div className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-4">
        {CARDS.map((c) => <PeriodCard key={c.key} title={titles[c.key]} stats={stats[c.key]} gradient={c.gradient} icon={c.icon} />)}
      </div>
      <p className="-mt-3 text-xs text-zinc-400">
        Doanh thu và lợi nhuận chỉ tính đơn hoàn tất. Lợi nhuận = doanh thu − giá vốn đang đặt cho sản phẩm. Thời gian theo giờ Việt Nam.
      </p>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title={`Thống kê đơn hàng tháng ${m + 1}`} action={monthPicker}>
          <BarChart
            labels={labels}
            series={[
              { label: 'Lợi nhuận (USD)', color: '#38bdf8', values: series.map((p) => p.profit) },
              { label: 'Doanh thu (USD)', color: '#8b5cf6', values: series.map((p) => p.revenue) },
            ]}
          />
        </Panel>
        <Panel title={`Thống kê nạp tiền tháng ${m + 1}`} action={monthPicker}>
          <BarChart labels={labels} series={[{ label: 'Tiền nạp (USD)', color: '#2563eb', values: series.map((p) => p.deposit) }]} />
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Đơn hàng gần đây" action={<Link href="/admin/orders" className="text-xs font-medium text-indigo-600 hover:underline">Xem tất cả →</Link>} bodyClassName="overflow-x-auto">
          <table className="table">
            <tbody>
              {recentOrders.length === 0 && <tr><td className="py-8 text-center text-zinc-400">Chưa có đơn hàng</td></tr>}
              {recentOrders.map((o) => (
                <tr key={o.code}>
                  <td>
                    <Link href={`/admin/orders/${o.code}`} className="font-mono text-xs font-medium text-indigo-600 hover:underline">{o.code}</Link>
                    <p className="max-w-44 truncate text-xs text-zinc-400">{o.user.email}</p>
                  </td>
                  <td className="max-w-56 truncate text-xs">{o.quantity} × {localized(o.product.name)}</td>
                  <td className="font-medium whitespace-nowrap tabular-nums">{formatUsd(o.totalAmount)}</td>
                  <td><Badge value={o.status} /></td>
                  <td className="text-xs whitespace-nowrap text-zinc-400"><LocalTime value={o.createdAt} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Nạp tiền gần đây" action={<Link href="/admin/transactions?type=DEPOSIT" className="text-xs font-medium text-indigo-600 hover:underline">Xem tất cả →</Link>} bodyClassName="overflow-x-auto">
          <table className="table">
            <tbody>
              {recentDeposits.length === 0 && <tr><td className="py-8 text-center text-zinc-400">Chưa có giao dịch nạp</td></tr>}
              {recentDeposits.map((t) => (
                <tr key={t.id}>
                  <td className="max-w-48 truncate text-xs">{t.user.email}</td>
                  <td className="text-xs whitespace-nowrap">{METHOD_LABEL[t.method]}</td>
                  <td className="font-medium whitespace-nowrap text-emerald-600 tabular-nums">+{formatUsd(t.amount)}</td>
                  <td><Badge value={t.status} /></td>
                  <td className="text-xs whitespace-nowrap text-zinc-400"><LocalTime value={t.createdAt} /></td>
                  <td className="text-right"><Link href={`/admin/transactions/${t.id}`} className="text-xs font-medium text-indigo-600 hover:underline">{t.status === 'PENDING' ? 'Duyệt' : 'Xem'}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
