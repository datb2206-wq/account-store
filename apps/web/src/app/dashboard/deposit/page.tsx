import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { Badge } from '@/components/badge';
import { DepositForms, type BankOption } from '@/components/deposit/deposit-forms';
import { Money } from '@/components/money';
import { Pagination } from '@/components/pagination';
import { requireUser } from '@/lib/auth';
import { expireStaleDeposits, getConfig } from '@accszone/core';
import { formatDate, formatOriginal } from '@/lib/format';
import { rich } from '@/i18n/rich';
import { getI18n } from '@/i18n/server';
import { buildHref } from '@/lib/url';

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return { title: d.meta.deposit };
}

const PAGE_SIZE = 15;

export default async function DepositPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const { d } = await getI18n();
  const t = d.deposit;
  const page = Math.max(1, Number.parseInt((await searchParams).page ?? '1', 10) || 1);
  await expireStaleDeposits();

  const [accounts, rates, trc20, bep20, deposit, total, history] = await Promise.all([
    getConfig('bank.accounts'),
    getConfig('currency.rates'),
    getConfig('usdt.trc20'),
    getConfig('usdt.bep20'),
    getConfig('deposit'),
    prisma.transaction.count({ where: { userId: user.id, type: 'DEPOSIT' } }),
    prisma.transaction.findMany({
      where: { userId: user.id, type: 'DEPOSIT' },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, method: true, status: true, amount: true, originalAmount: true, originalCurrency: true, createdAt: true, claimedAt: true },
    }),
  ]);

  // Chỉ hiện tài khoản ngân hàng có tỷ giá; không gửi số tài khoản xuống client ở bước này
  const banks: BankOption[] = accounts.flatMap((a, index) =>
    rates[a.currency] ? [{ index, bankName: a.bankName, currency: a.currency, rate: rates[a.currency]! }] : [],
  );
  const networks = [trc20.enabled && trc20.wallet ? 'TRC20' : null, bep20.enabled && bep20.wallet ? 'BEP20' : null].filter(
    (n): n is 'TRC20' | 'BEP20' => n !== null,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="text-sm text-zinc-500">{rich(t.currentBalance, { amount: <b className="text-zinc-900"><Money value={user.balance} /></b> })}</p>
      </div>

      <div className="max-w-xl">
        <DepositForms banks={banks} networks={networks} minUsd={deposit.minAmountUsd} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t.history}</h2>
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr><th>{t.colDate}</th><th>{t.colMethod}</th><th>{t.colPaid}</th><th>{t.colCredited}</th><th>{t.colStatus}</th><th /></tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-zinc-500">{t.empty}</td></tr>
              )}
              {history.map((dep) => (
                <tr key={dep.id}>
                  <td className="text-zinc-500">{formatDate(dep.createdAt)}</td>
                  <td>{d.method[dep.method] ?? dep.method}</td>
                  <td className="tabular-nums">{formatOriginal(dep.originalAmount, dep.originalCurrency)}</td>
                  <td className="tabular-nums">{dep.status === 'COMPLETED' ? <Money value={dep.amount} /> : '—'}</td>
                  <td><Badge value={dep.status} label={dep.status === 'PENDING' && dep.claimedAt ? d.bankClaim.awaitingTitle : d.status[dep.status]} /></td>
                  <td className="text-right">
                    <Link href={`/dashboard/deposit/${dep.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                      {dep.status === 'PENDING' ? t.continue : t.details}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          labels={d.common}
          page={page}
          totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          hrefFor={(p) => buildHref('/dashboard/deposit', { page: p > 1 ? p : undefined })}
        />
      </section>
    </div>
  );
}
