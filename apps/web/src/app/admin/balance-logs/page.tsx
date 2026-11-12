import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type Prisma, type TransactionType } from '@accszone/database';
import { FilterBar, PageHeader, Panel } from '@/components/admin/ui';
import { LocalTime } from '@/components/local-time';
import { Pagination } from '@/components/pagination';
import { vnDayRange } from '@/lib/admin-stats';
import { requireStaff } from '@/lib/auth';
import { formatUsd, localized, METHOD_LABEL } from '@/lib/format';
import { buildHref } from '@/lib/url';

export const metadata: Metadata = { title: 'Biến động số dư' };

const PAGE_SIZE = 30;
const TYPE_LABEL: Record<TransactionType, string> = {
  DEPOSIT: 'Nạp tiền',
  PURCHASE: 'Mua hàng',
  REFUND: 'Hoàn tiền',
  ADJUSTMENT: 'Admin cộng / trừ',
  BONUS: 'Khuyến mãi nạp tiền',
};

export default async function BalanceLogsPage({ searchParams }: { searchParams: Promise<Partial<Record<string, string>>> }) {
  await requireStaff();
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const type = (Object.keys(TYPE_LABEL) as TransactionType[]).find((t) => t === sp.type);
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  // Chỉ giao dịch đã ghi vào số dư (COMPLETED) mới có số dư trước / sau
  const where: Prisma.TransactionWhereInput = {
    status: 'COMPLETED',
    type,
    createdAt: vnDayRange(sp.from, sp.to),
    user: q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }, { id: q }] } : undefined,
  };

  const [total, rows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, type: true, method: true, amount: true, balanceBefore: true, balanceAfter: true, note: true, createdAt: true,
        user: { select: { email: true } },
        order: { select: { code: true, quantity: true, product: { select: { name: true } } } },
      },
    }),
  ]);
  const filters = { q, type, from: sp.from, to: sp.to };
  const filtered = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-5">
      <PageHeader title="Biến động số dư" count={total} />
      <Panel title="Nhật ký thay đổi số dư">
        <div className="space-y-4">
          <FilterBar resetHref="/admin/balance-logs" active={filtered}>
            <input name="q" defaultValue={q} placeholder="Email / username / ID" className="input w-56" />
            <select name="type" defaultValue={type ?? ''} className="input w-48">
              <option value="">Tất cả giao dịch</option>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="date" name="from" defaultValue={sp.from} className="input w-40" title="Từ ngày" />
            <input type="date" name="to" defaultValue={sp.to} className="input w-40" title="Đến ngày" />
          </FilterBar>

          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>#</th><th>Thành viên</th><th className="text-right">Số dư trước</th><th className="text-right">Thay đổi</th><th className="text-right">Số dư sau</th><th>Thời gian</th><th>Lý do</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-zinc-400">Không có dữ liệu</td></tr>}
                {rows.map((t, i) => {
                  const neg = t.amount.isNegative();
                  return (
                    <tr key={t.id} className="odd:bg-zinc-50/60">
                      <td className="text-zinc-400 tabular-nums">{total - (page - 1) * PAGE_SIZE - i}</td>
                      <td className="max-w-52 truncate">
                        <Link href={buildHref('/admin/balance-logs', { q: t.user.email })} className="font-medium text-indigo-600 hover:underline">{t.user.email}</Link>
                      </td>
                      <td className="text-right text-zinc-600 tabular-nums">{t.balanceBefore ? formatUsd(t.balanceBefore) : '—'}</td>
                      <td className={`text-right font-semibold tabular-nums ${neg ? 'text-red-600' : 'text-emerald-600'}`}>{neg ? '' : '+'}{formatUsd(t.amount)}</td>
                      <td className="text-right font-semibold text-blue-700 tabular-nums">{t.balanceAfter ? formatUsd(t.balanceAfter) : '—'}</td>
                      <td className="text-xs whitespace-nowrap text-zinc-500"><LocalTime value={t.createdAt} /></td>
                      <td className="max-w-lg text-xs text-zinc-700 italic">
                        {t.order ? (
                          <>
                            {t.type === 'REFUND' ? 'Hoàn tiền đơn hàng' : 'Thanh toán đơn hàng'} {t.order.quantity} × {localized(t.order.product.name)} –{' '}
                            <Link href={`/admin/orders/${t.order.code}`} className="font-mono text-indigo-600 not-italic hover:underline">#{t.order.code}</Link>
                          </>
                        ) : t.type === 'DEPOSIT' ? (
                          <Link href={`/admin/transactions/${t.id}`} className="hover:text-indigo-600">[Cộng tiền nạp] {METHOD_LABEL[t.method]}</Link>
                        ) : (
                          <>[{TYPE_LABEL[t.type]}] {t.note}</>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} hrefFor={(p) => buildHref('/admin/balance-logs', { ...filters, page: p > 1 ? p : undefined })} />
        </div>
      </Panel>
    </div>
  );
}
