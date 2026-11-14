import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { WithdrawalActions } from '@/components/admin/affiliate-admin';
import { FilterBar, PageHeader, Panel } from '@/components/admin/ui';
import { LocalTime } from '@/components/local-time';
import { requireStaff } from '@/lib/auth';
import { formatUsd } from '@/lib/format';
import { can } from '@/lib/permissions';

export const metadata: Metadata = { title: 'Lệnh rút hoa hồng' };

const STATUS: Record<string, [string, string]> = {
  PENDING: ['Chờ duyệt', 'bg-amber-50 text-amber-700'],
  COMPLETED: ['Hoàn tất', 'bg-emerald-50 text-emerald-700'],
  REJECTED: ['Từ chối', 'bg-red-50 text-red-700'],
};

export default async function AffiliateWithdrawalsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireStaff();
  const { status: s } = await searchParams;
  const status = s && s in STATUS ? s : undefined;
  const rows = await prisma.affiliateWithdrawal.findMany({ where: { status }, orderBy: { createdAt: 'desc' }, take: 200 });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, email: true } });
  const email = new Map(users.map((u) => [u.id, u.email]));
  const editable = can(user, 'affiliate.edit');

  return (
    <div className="space-y-5">
      <PageHeader title="Lệnh rút hoa hồng" count={rows.length}>
        <Link href="/admin/affiliate" className="btn-ghost border border-zinc-200">← Affiliate</Link>
      </PageHeader>
      <p className="text-sm text-zinc-500">Rút về ngân hàng: chuyển khoản tay cho khách rồi bấm &quot;Đã chuyển&quot;. Từ chối thì hoa hồng được trả lại cho khách. Rút vào số dư được hoàn tất tự động.</p>
      <Panel title="Danh sách" bodyClassName="space-y-4 p-5">
        <FilterBar resetHref="/admin/affiliate/withdrawals" active={!!status}>
          <select name="status" defaultValue={status ?? ''} className="input w-44">
            <option value="">Mọi trạng thái</option>
            {Object.entries(STATUS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </FilterBar>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Thời gian</th><th>Khách</th><th>Số tiền</th><th>Hình thức</th><th>Trạng thái</th><th /></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-zinc-400">Không có lệnh rút nào</td></tr>}
              {rows.map((w) => {
                const [label, tone] = STATUS[w.status] ?? [w.status, 'bg-zinc-100 text-zinc-600'];
                return (
                  <tr key={w.id} className="odd:bg-zinc-50/60">
                    <td className="text-xs text-zinc-500"><LocalTime value={w.createdAt} /></td>
                    <td className="text-sm">{email.get(w.userId) ?? w.userId}</td>
                    <td className="font-semibold tabular-nums">{formatUsd(w.amount)}</td>
                    <td className="text-sm">
                      {w.method === 'balance' ? 'Vào số dư' : (
                        <>
                          <p className="font-medium">{w.bankName}</p>
                          <p className="font-mono text-xs">{w.accountNo}</p>
                          <p className="text-xs text-zinc-500">{w.accountName}</p>
                        </>
                      )}
                    </td>
                    <td>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
                      {w.note && <p className="mt-1 text-xs text-zinc-500">{w.note}</p>}
                    </td>
                    <td className="text-right">{editable && w.status === 'PENDING' && <WithdrawalActions id={w.id} label={`${formatUsd(w.amount)} cho ${email.get(w.userId) ?? 'khách'}`} />}</td>
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
