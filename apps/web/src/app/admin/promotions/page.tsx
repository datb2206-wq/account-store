import type { Metadata } from 'next';
import { prisma } from '@accszone/database';
import { ActionButton, QuickForm } from '@/components/admin/quick-form';
import { MiniStat, PageHeader, Panel } from '@/components/admin/ui';
import { GiftIcon, WalletIcon } from '@/components/icons';
import { LocalTime } from '@/components/local-time';
import { can } from '@/lib/permissions';
import { requireStaff } from '@/lib/auth';
import { formatUsd } from '@/lib/format';

export const metadata: Metadata = { title: 'Khuyến mãi nạp tiền' };

export default async function DepositPromotionsPage() {
  const admin = await requireStaff();
  const [tiers, paid] = await Promise.all([
    prisma.depositBonus.findMany({ orderBy: { minAmount: 'asc' } }),
    prisma.transaction.aggregate({ where: { type: 'BONUS', status: 'COMPLETED' }, _sum: { amount: true }, _count: true }),
  ]);
  const superAdmin = can(admin, 'promotions.edit');

  return (
    <div className="space-y-5">
      <PageHeader title="Khuyến mãi nạp tiền" />

      <div className="grid gap-4 sm:grid-cols-2">
        <MiniStat tone="amber" icon={<GiftIcon size={20} />} value={formatUsd(paid._sum.amount)} label="Tổng tiền thưởng đã tặng" />
        <MiniStat tone="emerald" icon={<WalletIcon size={20} />} value={paid._count} label="Lượt nạp được thưởng" />
      </div>

      {superAdmin && (
        <Panel title="Tạo mốc nạp mới">
          <QuickForm
            url="/api/admin/deposit-bonuses"
            submitLabel="+ Tạo mốc nạp"
            columns={3}
            fields={[
              { name: 'minAmount', label: 'Nạp từ (USD)', placeholder: '50', required: true },
              { name: 'bonusPercent', label: 'Thưởng thêm (%)', type: 'number', step: '0.01', placeholder: '5', required: true },
              { name: 'isActive', label: 'Bật ngay', type: 'checkbox' },
            ]}
          />
          <p className="mt-3 text-xs text-zinc-400">
            Khi lệnh nạp được duyệt (tay hoặc tự động), khách được cộng thêm % của mốc cao nhất mà số tiền nạp đạt tới.
            VD có mốc $50 → 5% và $100 → 10%: nạp $120 được thưởng $12. Tiền thưởng ghi riêng trong Biến động số dư.
          </p>
        </Panel>
      )}

      <Panel title="Danh sách mốc nạp tiền" bodyClassName="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Số tiền nạp tối thiểu</th><th>Khuyến mãi thêm</th><th>Trạng thái</th><th>Thời gian tạo</th><th /></tr></thead>
          <tbody>
            {tiers.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-zinc-400">Chưa có mốc khuyến mãi nào</td></tr>}
            {tiers.map((t) => (
              <tr key={t.id} className="odd:bg-zinc-50/60">
                <td className="font-semibold tabular-nums">{formatUsd(t.minAmount)}</td>
                <td className="font-semibold text-emerald-600">+{Number(t.bonusPercent)}%</td>
                <td>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${t.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{t.isActive ? 'Đang bật' : 'Đã tắt'}</span>
                </td>
                <td className="text-xs text-zinc-500"><LocalTime value={t.createdAt} /></td>
                <td className="space-x-1 text-right whitespace-nowrap">
                  {superAdmin && (
                    <>
                      <ActionButton url={`/api/admin/deposit-bonuses/${t.id}`} method="PATCH" body={{ isActive: !t.isActive }} label={t.isActive ? 'Tắt' : 'Bật'} className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium hover:bg-zinc-100" />
                      <ActionButton url={`/api/admin/deposit-bonuses/${t.id}`} confirmText="Xóa mốc khuyến mãi này?" label="Xóa" />
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
