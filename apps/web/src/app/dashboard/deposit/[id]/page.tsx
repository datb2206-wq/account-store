import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@accszone/database';
import { Badge } from '@/components/badge';
import { CopyButton } from '@/components/copy-button';
import { BankClaim } from '@/components/deposit/bank-claim';
import { UsdtVerify } from '@/components/deposit/usdt-verify';
import { requireUser } from '@/lib/auth';
import { explorerTxUrl, shortHash } from '@/lib/chain-links';
import { expireStaleDeposits, getConfig } from '@accszone/core';
import { formatDate, formatOriginal, formatUsd } from '@/lib/format';
import { fmt } from '@/i18n/config';
import { rich } from '@/i18n/rich';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return { title: d.meta.depositDetails };
}

interface BankMeta {
  bank?: { bankName: string; accountNo: string; accountName: string; currency: string };
}

function Row({ label, value, copy, highlight }: { label: string; value: React.ReactNode; copy?: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 ${highlight ? 'bg-blue-50' : ''}`}>
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className={`truncate text-right ${highlight ? 'text-lg font-bold text-blue-700' : 'font-medium'}`}>{value}</span>
        {copy && <CopyButton value={copy} />}
      </span>
    </div>
  );
}

export default async function DepositDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { d } = await getI18n();
  const tr = d.depositDetail;
  const { id } = await params;
  await expireStaleDeposits();

  const t = await prisma.transaction.findFirst({ where: { id, userId: user.id, type: 'DEPOSIT' } });
  if (!t) notFound();

  const isUsdt = t.method === 'USDT_TRC20' || t.method === 'USDT_BEP20';
  // Hết hạn chưa quá 24h: vẫn cho gửi TxID (USDT) / báo đã chuyển khoản (ngân hàng) vì khách có thể chuyển trễ
  const open = t.status === 'PENDING' || (t.status === 'EXPIRED' && Date.now() - t.createdAt.getTime() < 24 * 3600_000);
  const awaitingReview = t.status === 'PENDING' && !!t.claimedAt;
  const required = isUsdt ? (await getConfig(t.network === 'BEP20' ? 'usdt.bep20' : 'usdt.trc20')).minConfirmations : 0;
  const bank = (t.metadata as BankMeta | null)?.bank;
  const exactUsdt = t.originalAmount?.toString() ?? '';

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/dashboard/deposit" className="text-sm text-zinc-500 hover:underline">{tr.back}</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{fmt(tr.title, { method: d.method[t.method] ?? t.method })}</h1>
          <Badge value={t.status} label={awaitingReview ? d.bankClaim.awaitingTitle : d.status[t.status]} />
        </div>
        <p className="text-sm text-zinc-500">{fmt(tr.created, { date: formatDate(t.createdAt) })}
          {t.status === 'PENDING' && t.expiresAt && !t.txHash && !t.claimedAt ? ` · ${fmt(tr.expires, { date: formatDate(t.expiresAt) })}` : ''}</p>
      </div>

      {t.status === 'COMPLETED' && (
        <div className="card space-y-1 border-emerald-200 bg-emerald-50">
          <p className="font-semibold text-emerald-800">{fmt(tr.credited, { amount: formatUsd(t.amount) })}</p>
          {t.txHash && (
            <p className="text-sm text-emerald-700">
              TxID: <a href={explorerTxUrl(t.network, t.txHash)} target="_blank" rel="noreferrer" className="font-mono underline">{shortHash(t.txHash)}</a>
            </p>
          )}
        </div>
      )}
      {t.status === 'REJECTED' && (
        <div className="card border-red-200 bg-red-50 text-sm text-red-800">
          {tr.rejected}{t.note && <> {fmt(tr.reason, { note: t.note })}</>}
        </div>
      )}
      {t.status === 'EXPIRED' && !open && (
        <div className="card border-amber-200 bg-amber-50 text-sm text-amber-900">
          {t.transferCode ? rich(tr.expiredCode, { code: <b>{t.transferCode}</b> }) : tr.expiredTx}
        </div>
      )}

      {open && t.method === 'BANK_TRANSFER' && bank && (
        <>
          <section className="card divide-y divide-zinc-100 p-0">
            <Row label={tr.bank} value={bank.bankName} />
            <Row label={tr.accountNo} value={<span className="font-mono">{bank.accountNo}</span>} copy={bank.accountNo} />
            <Row label={tr.accountName} value={bank.accountName} />
            <Row label={tr.amount} value={formatOriginal(t.originalAmount, t.originalCurrency)} copy={Number(t.originalAmount).toString()} />
            <Row label={tr.transferContent} value={<span className="font-mono">{t.transferCode}</span>} copy={t.transferCode ?? ''} highlight />
          </section>
          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">{tr.important}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>{rich(tr.bankNote1, { code: <b className="font-mono">{t.transferCode}</b> })}</li>
              <li>{rich(tr.bankNote2, { amount: <b>{formatUsd(t.amount)}</b> })}</li>
            </ul>
          </div>
          <section className="card">
            <BankClaim id={t.id} claimedAt={t.claimedAt ? formatDate(t.claimedAt) : null} hasProof={!!t.proofImageUrl} customerRef={t.customerRef} />
          </section>
        </>
      )}

      {open && isUsdt && (
        <>
          <section className="card divide-y divide-zinc-100 p-0">
            <Row label={tr.network} value={t.network === 'BEP20' ? 'BNB Smart Chain (BEP20)' : 'TRON (TRC20)'} />
            <Row label={tr.wallet} value={<span className="font-mono text-xs">{t.toAddress}</span>} copy={t.toAddress ?? ''} />
            <Row label={tr.exactAmount} value={`${exactUsdt} USDT`} copy={exactUsdt} highlight />
          </section>
          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            <ul className="list-disc space-y-1 pl-5">
              <li>{rich(tr.usdtNote1, { only: <b>{tr.onlyUsdt}</b>, network: <b>{t.network}</b> })}</li>
              <li>{rich(tr.usdtNote2, { amount: <b>{fmt(tr.exactlyUsdt, { amount: exactUsdt })}</b> })}</li>
              <li>{fmt(tr.usdtNote3, { n: required })}</li>
            </ul>
          </div>
          <section className="card">
            <UsdtVerify
              endpoint={`/api/deposits/${t.id}/verify`}
              network={t.network ?? 'TRC20'}
              txHash={t.txHash}
              confirmations={t.confirmations}
              required={required}
            />
          </section>
        </>
      )}
    </div>
  );
}
