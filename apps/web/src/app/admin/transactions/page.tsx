import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type PaymentMethod, type Prisma, type TransactionStatus, type TransactionType } from '@accszone/database';
import { AdjustBalanceButton } from '@/components/admin/adjust-balance';
import { Badge } from '@/components/badge';
import { Pagination } from '@/components/pagination';
import { StatCard } from '@/components/stat-card';
import { requireStaff } from '@/lib/auth';
import { shortHash } from '@/lib/chain-links';
import { expireStaleDeposits } from '@accszone/core';
import { formatDate, formatOriginal, formatUsd, METHOD_LABEL } from '@/lib/format';
import { buildHref } from '@/lib/url';

export const metadata: Metadata = { title: 'Giao dịch' };

const PAGE_SIZE = 30;
const TYPES: TransactionType[] = ['DEPOSIT', 'PURCHASE', 'REFUND', 'ADJUSTMENT'];
const STATUSES: TransactionStatus[] = ['PENDING', 'COMPLETED', 'REJECTED', 'EXPIRED'];
const METHODS: PaymentMethod[] = ['BANK_TRANSFER', 'USDT_TRC20', 'USDT_BEP20', 'BALANCE', 'MANUAL'];

const pick = <T extends string>(list: T[], v?: string) => list.find((x) => x === v);

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; method?: string; q?: string; page?: string }>;
}) {
  const admin = await requireStaff();
  const sp = await searchParams;
  const type = pick(TYPES, sp.type);
  const status = pick(STATUSES, sp.status);
  const method = pick(METHODS, sp.method);
  const q = sp.q?.trim() ?? '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  await expireStaleDeposits();

  const where: Prisma.TransactionWhereInput = {
    type,
    status,
    method,
    ...(q && {
      OR: [
        { id: q },
        { transferCode: q.toUpperCase() },
        { txHash: q.toLowerCase() },
        { bankRef: q },
        { order: { code: q.toUpperCase() } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
      ],
    }),
  };

  const [total, sums, pendingDeposits, rows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({ where: { ...where, status: status ?? 'COMPLETED' }, _sum: { amount: true } }),
    prisma.transaction.count({ where: { type: 'DEPOSIT', status: 'PENDING' } }),
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { email: true } }, order: { select: { code: true } } },
    }),
  ]);

  const filters = { type, status, method, q };
  const isPendingView = type === 'DEPOSIT' && status === 'PENDING' && !method && !q;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Giao dịch <span className="text-base font-normal text-zinc-400">({total})</span></h1>
        <div className="flex gap-2">
          <Link
            href={buildHref('/admin/transactions', { type: 'DEPOSIT', status: 'PENDING' })}
            className={isPendingView ? 'btn-primary' : 'btn-ghost border border-zinc-200'}
          >
            Chờ duyệt nạp {pendingDeposits > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-xs text-white">{pendingDeposits}</span>}
          </Link>
          {admin.role === 'SUPER_ADMIN' && <AdjustBalanceButton />}
        </div>
      </div>

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Email, mã NAP, TxID, mã đơn, ID…" className="input w-72" />
        <select name="type" defaultValue={type ?? ''} className="input w-40">
          <option value="">Mọi loại</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select name="status" defaultValue={status ?? ''} className="input w-40">
          <option value="">Mọi trạng thái</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select name="method" defaultValue={method ?? ''} className="input w-44">
          <option value="">Mọi phương thức</option>
          {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
        </select>
        <button className="btn-primary">Lọc</button>
        {(type || status || method || q) && <Link href="/admin/transactions" className="btn-ghost">Xóa lọc</Link>}
      </form>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Số giao dịch (theo bộ lọc)" value={total.toLocaleString()} />
        <StatCard
          label={`Tổng tiền ${status ? `(${status})` : '(chỉ COMPLETED)'}`}
          value={formatUsd(sums._sum.amount)}
          hint="Dương = tiền vào số dư khách, âm = tiền ra"
        />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr><th>Thời gian</th><th>Người dùng</th><th>Loại</th><th>Phương thức</th><th>Số tiền</th><th>Số dư sau</th><th>Trạng thái</th><th>Tham chiếu</th><th /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="py-10 text-center text-zinc-500">Không có giao dịch nào.</td></tr>
            )}
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="whitespace-nowrap text-zinc-500">{formatDate(t.createdAt)}</td>
                <td className="max-w-48 truncate">
                  <Link href={buildHref('/admin/transactions', { q: t.user.email })} className="hover:text-blue-600">{t.user.email}</Link>
                </td>
                <td className="text-xs font-medium">{t.type}</td>
                <td className="text-xs whitespace-nowrap">{METHOD_LABEL[t.method]}</td>
                <td className={`tabular-nums font-medium whitespace-nowrap ${t.amount.isNegative() ? 'text-red-600' : 'text-emerald-600'}`}>
                  {t.amount.isNegative() ? '' : '+'}{formatUsd(t.amount)}
                  {t.originalCurrency && t.originalCurrency !== 'USD' && (
                    <p className="text-xs font-normal text-zinc-400">{formatOriginal(t.originalAmount, t.originalCurrency)}</p>
                  )}
                </td>
                <td className="tabular-nums text-zinc-500">{t.balanceAfter ? formatUsd(t.balanceAfter) : '—'}</td>
                <td>
                  <Badge value={t.status} />
                  {t.status === 'PENDING' && t.claimedAt && <span className="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700" title="Khách đã bấm Tôi đã chuyển khoản">Đã báo CK{t.proofImageUrl ? ' + ảnh' : ''}</span>}
                </td>
                <td className="font-mono text-xs text-zinc-500">
                  {t.transferCode ?? (t.txHash && shortHash(t.txHash, 6)) ?? (t.order && <Link href={`/admin/orders/${t.order.code}`} className="text-blue-600 hover:underline">{t.order.code}</Link>) ?? (t.note && <span className="font-sans">{t.note.slice(0, 30)}</span>) ?? '—'}
                </td>
                <td className="text-right">
                  <Link href={`/admin/transactions/${t.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                    {t.type === 'DEPOSIT' && (t.status === 'PENDING' || t.status === 'EXPIRED') ? 'Duyệt' : 'Xem'}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} hrefFor={(p) => buildHref('/admin/transactions', { ...filters, page: p > 1 ? p : undefined })} />
    </div>
  );
}
