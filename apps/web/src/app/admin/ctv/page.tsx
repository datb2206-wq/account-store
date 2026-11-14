import type { Metadata } from 'next';
import Link from 'next/link';
import { getCtvSettings } from '@accszone/core';
import { prisma, type SellerStatus } from '@accszone/database';
import { CtvSettingsForm, SellerActions } from '@/components/admin/ctv-admin';
import { FilterBar, MiniStat, PageHeader, Panel } from '@/components/admin/ui';
import { BoxIcon, StoreIcon, UsersIcon, WalletIcon } from '@/components/icons';
import { LocalTime } from '@/components/local-time';
import { requireStaff } from '@/lib/auth';
import { formatUsd } from '@/lib/format';
import { can } from '@/lib/permissions';
import { buildHref } from '@/lib/url';

export const metadata: Metadata = { title: 'CTV (người bán)' };

const STATUS: Record<SellerStatus, [string, string]> = {
  PENDING: ['Chờ duyệt', 'bg-amber-50 text-amber-700'],
  ACTIVE: ['Đang hoạt động', 'bg-emerald-50 text-emerald-700'],
  SUSPENDED: ['Đã khóa', 'bg-red-50 text-red-700'],
  REJECTED: ['Từ chối', 'bg-zinc-100 text-zinc-500'],
};

export default async function CtvAdminPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireStaff();
  const { status: s } = await searchParams;
  const status = s && s in STATUS ? (s as SellerStatus) : undefined;
  const editable = can(user, 'ctv.edit');

  const [settings, sellers, counts, balances, pendingProducts, pendingW, fees] = await Promise.all([
    getCtvSettings(),
    prisma.seller.findMany({ where: { status }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 200, include: { user: { select: { email: true } }, _count: { select: { products: true } } } }),
    prisma.seller.groupBy({ by: ['status'], _count: true }),
    prisma.seller.aggregate({ _sum: { balance: true } }),
    prisma.product.count({ where: { sellerId: { not: null }, approval: 'PENDING' } }),
    prisma.sellerWithdrawal.count({ where: { status: 'PENDING' } }),
    // Phí sàn web thu được = tiền thực thu − phần trả CTV
    prisma.sellerEarning.aggregate({ where: { status: { not: 'REVERSED' } }, _sum: { orderAmount: true, amount: true } }),
  ]);
  const hold = await prisma.sellerEarning.groupBy({ by: ['sellerId'], where: { status: 'HOLD', sellerId: { in: sellers.map((x) => x.id) } }, _sum: { amount: true } });
  const holdMap = new Map(hold.map((h) => [h.sellerId, h._sum.amount]));
  const count = (k: SellerStatus) => counts.find((c) => c.status === k)?._count ?? 0;
  const platformFee = (fees._sum.orderAmount ?? 0) && fees._sum.orderAmount!.sub(fees._sum.amount ?? 0);

  return (
    <div className="space-y-5">
      <PageHeader title="CTV (người bán)">
        <Link href="/admin/ctv/products" className="btn-ghost border border-zinc-200">Sản phẩm chờ duyệt{pendingProducts > 0 && ` (${pendingProducts})`}</Link>
        <Link href="/admin/ctv/withdrawals" className="btn-ghost border border-zinc-200">Lệnh rút{pendingW > 0 && ` (${pendingW})`}</Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat tone="emerald" icon={<StoreIcon size={20} />} value={count('ACTIVE')} label="CTV đang hoạt động" />
        <MiniStat tone="amber" icon={<UsersIcon size={20} />} value={count('PENDING')} label="Đơn đăng ký chờ duyệt" />
        <MiniStat tone="sky" icon={<WalletIcon size={20} />} value={formatUsd(balances._sum.balance)} label="Tiền CTV chưa rút" />
        <MiniStat tone="violet" icon={<BoxIcon size={20} />} value={formatUsd(platformFee || 0)} label="Phí sàn đã thu" />
      </div>

      {editable && (
        <Panel title="Cấu hình">
          <CtvSettingsForm initial={settings} />
        </Panel>
      )}

      <Panel title="Danh sách CTV" bodyClassName="space-y-4 p-5">
        <FilterBar resetHref="/admin/ctv" active={!!status}>
          <select name="status" defaultValue={status ?? ''} className="input w-44">
            <option value="">Mọi trạng thái</option>
            {(Object.keys(STATUS) as SellerStatus[]).map((k) => <option key={k} value={k}>{STATUS[k][0]}</option>)}
          </select>
        </FilterBar>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Shop</th><th>Tài khoản</th><th>Liên hệ</th><th>Sản phẩm</th><th>Phí sàn</th><th>Số dư</th><th>Đang giữ</th><th>Trạng thái</th><th /></tr></thead>
            <tbody>
              {sellers.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-zinc-400">Chưa có CTV nào</td></tr>}
              {sellers.map((x) => {
                const [label, tone] = STATUS[x.status];
                return (
                  <tr key={x.id} className="odd:bg-zinc-50/60 align-top">
                    <td className="max-w-56">
                      <p className="font-medium">{x.shopName}</p>
                      {x.intro && <p className="line-clamp-2 text-xs text-zinc-500" title={x.intro}>{x.intro}</p>}
                      <p className="text-[11px] text-zinc-400"><LocalTime value={x.createdAt} /></p>
                    </td>
                    <td className="text-sm"><Link href={buildHref('/admin/users', { q: x.user.email })} className="text-indigo-600 hover:underline">{x.user.email}</Link></td>
                    <td className="max-w-40 truncate text-sm" title={x.contact}>{x.contact || '—'}</td>
                    <td className="tabular-nums"><Link href={buildHref('/admin/ctv/products', { seller: x.id, status: 'all' })} className="hover:underline">{x._count.products}</Link></td>
                    <td className="tabular-nums">{x.commissionPercent ? `${Number(x.commissionPercent)}%` : <span className="text-zinc-400">{settings.commissionPercent}% (mặc định)</span>}</td>
                    <td className={`font-medium tabular-nums ${x.balance.isNegative() ? 'text-red-600' : ''}`}>{formatUsd(x.balance)}</td>
                    <td className="text-zinc-500 tabular-nums">{formatUsd(holdMap.get(x.id) ?? 0)}</td>
                    <td>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
                      {x.adminNote && <p className="mt-1 max-w-40 text-xs text-zinc-500">{x.adminNote}</p>}
                    </td>
                    <td className="text-right">{editable && <SellerActions id={x.id} status={x.status} commission={x.commissionPercent ? String(Number(x.commissionPercent)) : null} defaultFee={settings.commissionPercent} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
