import type { Metadata } from 'next';
import { ensureReferralCode, getAffiliateSettings } from '@accszone/core';
import { prisma } from '@accszone/database';
import { LocalTime } from '@/components/local-time';
import { Money } from '@/components/money';
import { StatCard } from '@/components/stat-card';
import { fmt } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { requireUser } from '@/lib/auth';
import { formatUsd } from '@/lib/format';
import { getSiteUrl } from '@/lib/site';
import { CopyLink, WithdrawForm } from './affiliate-client';

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return { title: d.affiliate.title };
}

// Che bớt email người được giới thiệu (quyền riêng tư): ab***@gmail.com
const maskEmail = (e: string) => e.replace(/^(.{2})[^@]*/, '$1***');

export default async function AffiliatePage() {
  const user = await requireUser();
  const [{ d }, settings] = await Promise.all([getI18n(), getAffiliateSettings()]);
  const t = d.affiliate;
  if (!settings.enabled) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <p className="mt-2 text-sm text-zinc-500">{t.disabled}</p>
      </div>
    );
  }

  const [code, siteUrl] = await Promise.all([ensureReferralCode(user.id), getSiteUrl()]);
  const [me, referred, earned, commissions, withdrawals] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { commissionBalance: true } }),
    prisma.user.count({ where: { referredById: user.id } }),
    prisma.affiliateCommission.aggregate({ where: { referrerId: user.id, status: 'CREDITED' }, _sum: { amount: true } }),
    prisma.affiliateCommission.findMany({ where: { referrerId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.affiliateWithdrawal.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  const buyers = await prisma.user.findMany({ where: { id: { in: [...new Set(commissions.map((c) => c.buyerId))] } }, select: { id: true, email: true, username: true } });
  const buyerName = new Map(buyers.map((b) => [b.id, b.username ?? maskEmail(b.email)]));
  const status = (s: string) => (t as Record<string, string>)[s] ?? s;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{fmt(t.subtitle, { percent: settings.percent })}</p>
      </div>

      <section className="card space-y-2">
        <h2 className="font-semibold">{t.yourLink}</h2>
        <CopyLink link={`${siteUrl}/r/${code}`} />
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t.referred} value={referred} />
        <StatCard label={t.totalEarned} value={<Money value={earned._sum.amount} />} />
        <StatCard label={t.commissionBalance} value={<Money value={me.commissionBalance} />} />
      </div>

      {(settings.allowBalance || settings.allowBank) && (
        <section className="card space-y-3">
          <h2 className="font-semibold">{t.withdrawTitle}</h2>
          <WithdrawForm allowBalance={settings.allowBalance} allowBank={settings.allowBank} minWithdraw={formatUsd(settings.minWithdraw)} />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card overflow-x-auto">
          <h2 className="mb-3 font-semibold">{t.commissions}</h2>
          {commissions.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">{t.empty}</p>
          ) : (
            <table className="table">
              <thead><tr><th>{t.colDate}</th><th>{t.colBuyer}</th><th>{t.colOrderAmount}</th><th>{t.colCommission}</th></tr></thead>
              <tbody>
                {commissions.map((c) => (
                  <tr key={c.id}>
                    <td className="text-xs text-zinc-500"><LocalTime value={c.createdAt} /></td>
                    <td className="text-sm">{buyerName.get(c.buyerId) ?? '—'}</td>
                    <td className="tabular-nums"><Money value={c.orderAmount} /></td>
                    <td className={`tabular-nums ${c.status === 'REVERSED' ? 'text-zinc-400 line-through' : 'font-medium text-emerald-600'}`} title={status(c.status)}>
                      +<Money value={c.amount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card overflow-x-auto">
          <h2 className="mb-3 font-semibold">{t.withdrawals}</h2>
          {withdrawals.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">{t.empty}</p>
          ) : (
            <table className="table">
              <thead><tr><th>{t.colDate}</th><th>{t.colMethod}</th><th>{t.colAmount}</th><th>{t.colStatus}</th></tr></thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id}>
                    <td className="text-xs text-zinc-500"><LocalTime value={w.createdAt} /></td>
                    <td className="text-sm">{w.method === 'balance' ? t.toBalance : `${w.bankName} · ${w.accountNo}`}</td>
                    <td className="tabular-nums"><Money value={w.amount} /></td>
                    <td className="text-sm">
                      {status(w.status)}
                      {w.note && <p className="text-xs text-zinc-400">{w.note}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
