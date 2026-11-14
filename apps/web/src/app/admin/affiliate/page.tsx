import type { Metadata } from 'next';
import Link from 'next/link';
import { getAffiliateSettings } from '@accszone/core';
import { prisma } from '@accszone/database';
import { AffiliateSettingsForm } from '@/components/admin/affiliate-admin';
import { MiniStat, PageHeader, Panel } from '@/components/admin/ui';
import { GiftIcon, UsersIcon, WalletIcon } from '@/components/icons';
import { LocalTime } from '@/components/local-time';
import { requireStaff } from '@/lib/auth';
import { formatUsd } from '@/lib/format';
import { can } from '@/lib/permissions';
import { buildHref } from '@/lib/url';

export const metadata: Metadata = { title: 'Affiliate Program' };

export default async function AffiliateAdminPage() {
  const user = await requireStaff();
  const [settings, referred, credited, balances, pendingW, commissions] = await Promise.all([
    getAffiliateSettings(),
    prisma.user.count({ where: { referredById: { not: null } } }),
    prisma.affiliateCommission.aggregate({ where: { status: 'CREDITED' }, _sum: { amount: true } }),
    prisma.user.aggregate({ _sum: { commissionBalance: true } }),
    prisma.affiliateWithdrawal.count({ where: { status: 'PENDING' } }),
    prisma.affiliateCommission.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  const ids = [...new Set(commissions.flatMap((c) => [c.referrerId, c.buyerId]))];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } });
  const email = new Map(users.map((u) => [u.id, u.email]));

  return (
    <div className="space-y-5">
      <PageHeader title="Affiliate Program">
        <Link href="/admin/affiliate/withdrawals" className="btn-ghost border border-zinc-200">Lệnh rút tiền{pendingW > 0 && ` (${pendingW} chờ duyệt)`}</Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat tone="violet" icon={<UsersIcon size={20} />} value={referred} label="Người được giới thiệu" />
        <MiniStat tone="emerald" icon={<GiftIcon size={20} />} value={formatUsd(credited._sum.amount)} label="Tổng hoa hồng đã trả" />
        <MiniStat tone="sky" icon={<WalletIcon size={20} />} value={formatUsd(balances._sum.commissionBalance)} label="Hoa hồng khách chưa rút" />
        <MiniStat tone="amber" icon={<WalletIcon size={20} />} value={pendingW} label="Lệnh rút chờ duyệt" />
      </div>

      {can(user, 'affiliate.edit') && (
        <Panel title="Cấu hình">
          <AffiliateSettingsForm initial={settings} />
        </Panel>
      )}

      <Panel title="Lịch sử hoa hồng (50 gần nhất)" bodyClassName="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Thời gian</th><th>Người nhận</th><th>Người mua</th><th>Đơn hàng</th><th>%</th><th>Hoa hồng</th><th>Trạng thái</th></tr></thead>
          <tbody>
            {commissions.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-zinc-400">Chưa có hoa hồng nào</td></tr>}
            {commissions.map((c) => (
              <tr key={c.id} className="odd:bg-zinc-50/60">
                <td className="text-xs text-zinc-500"><LocalTime value={c.createdAt} /></td>
                <td className="text-sm"><Link href={buildHref('/admin/users', { q: email.get(c.referrerId) })} className="text-indigo-600 hover:underline">{email.get(c.referrerId) ?? '—'}</Link></td>
                <td className="text-sm">{email.get(c.buyerId) ?? '—'}</td>
                <td className="tabular-nums">{formatUsd(c.orderAmount)}</td>
                <td className="tabular-nums">{Number(c.percent)}%</td>
                <td className="font-medium text-emerald-600 tabular-nums">{formatUsd(c.amount)}</td>
                <td>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${c.status === 'CREDITED' ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                    {c.status === 'CREDITED' ? 'Đã cộng' : 'Đã thu hồi (đơn hoàn tiền)'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
