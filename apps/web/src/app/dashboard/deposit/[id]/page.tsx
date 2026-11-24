import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { prisma } from '@accszone/database';
import { AutoRefresh } from '@/components/auto-refresh';
import { Badge } from '@/components/badge';
import { BlogContent } from '@/components/blog-content';
import { CopyButton } from '@/components/copy-button';
import { DepositClaim } from '@/components/deposit/deposit-claim';
import { BnbLogo, PixLogo, TronLogo, UsdtLogo } from '@/components/deposit/pay-logos';
import { PixCopyButton, PixCountdown } from '@/components/deposit/pix-countdown';
import { UsdtVerify } from '@/components/deposit/usdt-verify';
import { LocalTime } from '@/components/local-time';
import { Money } from '@/components/money';
import { requireUser } from '@/lib/auth';
import { explorerTxUrl, shortHash } from '@/lib/chain-links';
import { checkPixDeposit, expireStaleDeposits, getConfig, getPixSettings, pixAutoCredit } from '@accszone/core';
import { formatDate, formatOriginal } from '@/lib/format';
import { fmt } from '@/i18n/config';
import { rich } from '@/i18n/rich';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return { title: d.meta.depositDetails };
}

interface BankMeta {
  bank?: { bankName: string; accountNo: string; accountName: string; currency: string };
  manual?: { name: string; accountNo: string; accountName: string; instructions: string };
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

  let t = await prisma.transaction.findFirst({ where: { id, userId: user.id, type: 'DEPOSIT' } });
  if (!t) notFound();
  // PIX: mỗi lần trang tự tải lại thì hỏi cổng PIX xem khách trả chưa (nếu admin có đặt link kiểm tra)
  const pixAuto = t.method === 'PIX' && pixAutoCredit(await getPixSettings(), t.metadata);
  if (pixAuto && (t.status === 'PENDING' || t.status === 'EXPIRED')) {
    const before = t.status;
    if ((await checkPixDeposit(t.id)) !== before) t = (await prisma.transaction.findFirst({ where: { id, userId: user.id, type: 'DEPOSIT' } }))!;
  }

  const isUsdt = t.method === 'USDT_TRC20' || t.method === 'USDT_BEP20';
  // Hết hạn chưa quá 24h: vẫn cho gửi TxID (USDT) / báo đã chuyển khoản (ngân hàng) vì khách có thể chuyển trễ
  const open = t.status === 'PENDING' || (t.status === 'EXPIRED' && Date.now() - t.createdAt.getTime() < 24 * 3600_000);
  const awaitingReview = t.status === 'PENDING' && !!t.claimedAt;
  const required = isUsdt ? (await getConfig(t.network === 'BEP20' ? 'usdt.bep20' : 'usdt.trc20')).minConfirmations : 0;
  const bank = (t.metadata as BankMeta | null)?.bank;
  const manual = (t.metadata as BankMeta | null)?.manual;
  const exactUsdt = t.originalAmount?.toString() ?? '';
  // QR chỉ chứa địa chỉ ví (chuẩn chung mọi ví đọc được). Số tiền khách tự nhập theo số lẻ hiển thị bên cạnh.
  // Địa chỉ ví đã được kiểm tra định dạng ở cấu hình, SVG do thư viện sinh ra.
  const pix = (t.metadata as { pix?: { code: string } } | null)?.pix;
  const pixQr = open && t.method === 'PIX' && pix?.code ? await QRCode.toString(pix.code, { type: 'svg', margin: 1, errorCorrectionLevel: 'H' }) : null; // H: chịu được logo ở giữa
  const qrSvg = open && isUsdt && t.toAddress ? await QRCode.toString(t.toAddress, { type: 'svg', margin: 1, errorCorrectionLevel: 'H' }) : null; // H: chịu được logo ở giữa
  const bep = t.network === 'BEP20';

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/dashboard/deposit" className="text-sm text-zinc-500 hover:underline">{tr.back}</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{fmt(tr.title, { method: d.method[t.method] ?? t.method })}</h1>
          <Badge value={t.status} label={awaitingReview ? d.bankClaim.awaitingTitle : d.status[t.status]} />
        </div>
        <p className="text-sm text-zinc-500">{rich(tr.created, { date: <LocalTime value={t.createdAt} /> })}
          {t.status === 'PENDING' && t.expiresAt && !t.txHash && !t.claimedAt ? <> · {rich(tr.expires, { date: <LocalTime value={t.expiresAt} /> })}</> : ''}</p>
      </div>

      {t.status === 'COMPLETED' && (
        <div className="card space-y-1 border-emerald-200 bg-emerald-50">
          <p className="font-semibold text-emerald-800">{rich(tr.credited, { amount: <Money value={t.amount} /> })}</p>
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
              <li>{rich(tr.bankNote2, { amount: <b><Money value={t.amount} /></b> })}</li>
            </ul>
          </div>
          <section className="card">
            <DepositClaim kind="bank" id={t.id} claimedAt={t.claimedAt ? formatDate(t.claimedAt) : null} hasProof={!!t.proofImageUrl} customerRef={t.customerRef} />
          </section>
        </>
      )}

      {open && (t.method === 'MOMO' || t.method === 'CUSTOM') && manual && (
        <>
          <section className="card divide-y divide-zinc-100 p-0">
            <Row label={d.pay.method} value={manual.name} />
            <Row label={d.pay.account} value={<span className="font-mono">{manual.accountNo}</span>} copy={manual.accountNo} />
            {manual.accountName && <Row label={d.pay.recipient} value={manual.accountName} />}
            <Row label={tr.amount} value={formatOriginal(t.originalAmount, t.originalCurrency)} copy={Number(t.originalAmount).toString()} />
            <Row label={tr.transferContent} value={<span className="font-mono">{t.transferCode}</span>} copy={t.transferCode ?? ''} highlight />
          </section>
          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">{tr.important}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>{d.pay.noteContent}: <b className="font-mono">{t.transferCode}</b></li>
              <li>{rich(tr.bankNote2, { amount: <b><Money value={t.amount} /></b> })}</li>
            </ul>
          </div>
          {manual.instructions.trim() && (
            <section className="card space-y-2">
              <p className="font-semibold">{d.pay.instructions}</p>
              <BlogContent text={manual.instructions} />
            </section>
          )}
          <section className="card">
            <DepositClaim kind="bank" id={t.id} claimedAt={t.claimedAt ? formatDate(t.claimedAt) : null} hasProof={!!t.proofImageUrl} customerRef={t.customerRef} />
          </section>
        </>
      )}

      {open && t.method === 'PIX' && pix && (
        <>
          <section className="card overflow-hidden p-0">
            {/* Đầu thẻ: logo PIX + số tiền */}
            <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-[#32BCAD] to-[#1f8f84] px-5 py-4 text-white">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-full bg-white shadow-sm"><PixLogo size={28} /></span>
                <div>
                  <p className="leading-tight font-semibold">{d.pay.pixPayTitle}</p>
                  <p className="text-xs text-white/80">QR Code · Copia e Cola</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/80">{tr.amount}</p>
                <p className="text-2xl leading-tight font-bold tabular-nums">{formatOriginal(t.originalAmount, t.originalCurrency)}</p>
              </div>
            </div>

            {t.status === 'PENDING' && !t.claimedAt && (
              <div className="border-b border-zinc-100">
                <PixCountdown
                  startAt={t.createdAt.toISOString()}
                  expiresAt={(t.expiresAt ?? new Date(t.createdAt.getTime() + 30 * 60_000)).toISOString()}
                  label={d.pay.pixExpiresIn}
                  expiredLabel={d.pay.pixExpiredNow}
                />
              </div>
            )}

            <div className="space-y-4 p-5">
              {pixQr && (
                <div className="flex flex-col items-center gap-3">
                  <div className="relative rounded-2xl border-2 border-[#32BCAD]/30 bg-white p-3 shadow-sm">
                    <div role="img" aria-label={d.pay.pixQrAlt} className="size-56 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: pixQr }} />
                    <span className="pointer-events-none absolute top-1/2 left-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-lg bg-white shadow ring-2 ring-white">
                      <PixLogo size={28} />
                    </span>
                  </div>
                  <p className="max-w-sm text-center text-sm text-zinc-600">{d.pay.pixScan}</p>
                </div>
              )}
              <div className="space-y-2">
                <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{d.pay.pixCode}</span>
                <p className="line-clamp-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 font-mono text-xs break-all text-zinc-600 select-all">{pix.code}</p>
                <PixCopyButton value={pix.code} label={d.pay.pixCopyCode} copiedLabel={d.common.copied} />
              </div>
            </div>

            {/* 3 bước */}
            <ol className="grid grid-cols-3 gap-2 border-t border-zinc-100 bg-zinc-50/60 px-4 py-4 text-center text-xs text-zinc-600">
              {[
                { t: d.pay.pixHow1, i: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" strokeLinecap="round" /></> },
                { t: d.pay.pixHow2, i: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" strokeLinecap="round" /><path d="M8 12h8" strokeLinecap="round" /></> },
                { t: pixAuto ? d.pay.pixHow3 : d.pay.pixHow3Manual, i: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" /></> },
              ].map((s, k) => (
                <li key={k} className="flex flex-col items-center gap-1.5">
                  <span className="relative grid size-9 place-items-center rounded-full bg-white text-[#1f8f84] shadow-sm ring-1 ring-[#32BCAD]/30">
                    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">{s.i}</svg>
                    <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-[#32BCAD] text-[10px] font-bold text-white">{k + 1}</span>
                  </span>
                  <span className="leading-snug">{s.t}</span>
                </li>
              ))}
            </ol>

            {t.status === 'PENDING' && !t.claimedAt && (
              <div className="flex items-center gap-2.5 border-t border-zinc-100 px-5 py-3 text-sm text-zinc-700">
                {pixAuto && <AutoRefresh everyMs={8_000} />}
                <span className="relative flex size-2.5 shrink-0">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#32BCAD] opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-[#32BCAD]" />
                </span>
                <p>{pixAuto ? d.pay.pixWaiting : d.pay.pixManualWait}</p>
              </div>
            )}
            <p className="flex items-center justify-center gap-1.5 border-t border-zinc-100 py-2.5 text-xs text-zinc-400">
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
              {d.pay.pixSecure}
            </p>
          </section>

          {/* Gửi biên lai chuyển khoản: luôn hiện, phòng khi đã trả mà chưa được cộng */}
          <section className="card space-y-3">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#32BCAD]/10 text-[#1f8f84]">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7 3h7l5 5v13H7z" strokeLinejoin="round" /><path d="M14 3v5h5M10 13h6M10 17h6" strokeLinecap="round" /></svg>
              </span>
              <p className="text-sm text-zinc-600">{d.pay.pixAfterPay}</p>
            </div>
            <DepositClaim kind="bank" id={t.id} claimedAt={t.claimedAt ? formatDate(t.claimedAt) : null} hasProof={!!t.proofImageUrl} customerRef={t.customerRef} proofOnly />
          </section>
        </>
      )}

      {t.method === 'CARD' && (
        <section className="card divide-y divide-zinc-100 p-0">
          <Row label={d.pay.card} value={t.cardTelco ?? '—'} />
          <Row label={d.pay.serial} value={<span className="font-mono">{t.cardSerial}</span>} />
          <Row label={d.pay.declared} value={formatOriginal(t.originalAmount, t.originalCurrency)} />
        </section>
      )}
      {t.method === 'CARD' && t.status === 'PENDING' && (
        <div className="card border-blue-200 bg-blue-50 text-sm text-blue-900">
          <AutoRefresh everyMs={8_000} />
          <p className="font-semibold">{d.pay.cardPendingTitle}</p>
          <p>{d.pay.cardPendingText}</p>
        </div>
      )}

      {open && isUsdt && (
        <>
          <section className="card overflow-hidden p-0">
            {/* Đầu thẻ: logo USDT + mạng + số tiền chính xác */}
            <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-[#26A17B] to-[#1a7a5c] px-5 py-4 text-white">
              <div className="flex items-center gap-3">
                <span className="relative grid size-11 place-items-center rounded-full bg-white shadow-sm">
                  <UsdtLogo size={32} />
                  <span className="absolute -right-1 -bottom-1 rounded-full bg-white p-0.5">{bep ? <BnbLogo size={16} /> : <TronLogo size={16} />}</span>
                </span>
                <div>
                  <p className="leading-tight font-semibold">{d.pay.usdtPayTitle}</p>
                  <p className="text-xs text-white/80">{bep ? 'BNB Smart Chain (BEP20)' : 'TRON (TRC20)'}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/80">{tr.exactAmount}</p>
                <p className="text-2xl leading-tight font-bold tabular-nums">{exactUsdt} <span className="text-sm font-semibold">USDT</span></p>
              </div>
            </div>

            {t.status === 'PENDING' && t.expiresAt && !t.txHash && !t.claimedAt && (
              <div className="border-b border-zinc-100">
                <PixCountdown startAt={t.createdAt.toISOString()} expiresAt={t.expiresAt.toISOString()} label={d.pay.usdtExpiresIn} expiredLabel={d.pay.usdtExpiredNow} accent="#26A17B" accentDark="#1a7a5c" />
              </div>
            )}

            <div className="space-y-4 p-5">
              {qrSvg && (
                <div className="flex flex-col items-center gap-3">
                  <div className="relative rounded-2xl border-2 border-[#26A17B]/30 bg-white p-3 shadow-sm">
                    <div role="img" aria-label={tr.qrAlt} className="size-52 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                    <span className="pointer-events-none absolute top-1/2 left-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white shadow ring-2 ring-white">
                      <UsdtLogo size={30} />
                    </span>
                  </div>
                  <p className="max-w-sm text-center text-sm text-zinc-600">{tr.qrHint}</p>
                </div>
              )}
              <div className="space-y-2">
                <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{tr.wallet}</span>
                <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 text-center font-mono text-sm break-all text-zinc-700 select-all">{t.toAddress}</p>
                <PixCopyButton value={t.toAddress ?? ''} label={d.pay.usdtCopyAddress} copiedLabel={d.common.copied} colors="bg-[#26A17B] hover:bg-[#1f8a69]" />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
                <div>
                  <p className="text-xs text-emerald-700">{tr.exactAmount}</p>
                  <p className="font-mono text-lg font-bold text-emerald-800 tabular-nums">{exactUsdt} USDT</p>
                </div>
                <CopyButton value={exactUsdt} />
              </div>
            </div>

            {/* 3 bước */}
            <ol className="grid grid-cols-3 gap-2 border-t border-zinc-100 bg-zinc-50/60 px-4 py-4 text-center text-xs text-zinc-600">
              {[
                { t: d.pay.usdtHow1, i: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M16 12.5h2M3 10h18" strokeLinecap="round" /></> },
                { t: d.pay.usdtHow2, i: <><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></> },
                { t: d.pay.usdtHow3, i: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" /></> },
              ].map((s, k) => (
                <li key={k} className="flex flex-col items-center gap-1.5">
                  <span className="relative grid size-9 place-items-center rounded-full bg-white text-[#1a7a5c] shadow-sm ring-1 ring-[#26A17B]/30">
                    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">{s.i}</svg>
                    <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-[#26A17B] text-[10px] font-bold text-white">{k + 1}</span>
                  </span>
                  <span className="leading-snug">{s.t}</span>
                </li>
              ))}
            </ol>

            {t.status === 'PENDING' && !t.txHash && !t.claimedAt && (
              <div className="flex items-center gap-2.5 border-t border-zinc-100 px-5 py-3 text-sm text-zinc-700">
                <AutoRefresh everyMs={15_000} />
                <span className="relative flex size-2.5 shrink-0">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#26A17B] opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-[#26A17B]" />
                </span>
                <p>{d.pay.usdtWaiting}</p>
              </div>
            )}
          </section>
          <div className="flex gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-amber-500" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3 2 20h20L12 3Z" strokeLinejoin="round" /><path d="M12 10v4M12 17h.01" strokeLinecap="round" /></svg>
            <ul className="list-disc space-y-1 pl-4">
              <li>{rich(tr.usdtNote1, { only: <b>{tr.onlyUsdt}</b>, network: <b>{t.network}</b> })}</li>
              <li>{rich(tr.usdtNote2, { amount: <b>{fmt(tr.exactlyUsdt, { amount: exactUsdt })}</b> })}</li>
              <li>{fmt(tr.usdtNote3, { n: required })}</li>
            </ul>
          </div>
          <section className="card space-y-3">
            <div>
              <p className="font-semibold">{tr.verifyTitle}</p>
              <p className="text-sm text-zinc-500">{tr.verifyHint}</p>
            </div>
            <UsdtVerify
              endpoint={`/api/deposits/${t.id}/verify`}
              network={t.network ?? 'TRC20'}
              txHash={t.txHash}
              confirmations={t.confirmations}
              required={required}
            />
          </section>
          {/* Không tự xác minh được (chuyển lệch số tiền, sàn không cho xem TxID…): gửi biên lai để admin duyệt tay */}
          {!t.txHash && (
            <details className="card group" open={!!t.claimedAt}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm text-zinc-600">
                <span>{d.pay.usdtClaimSummary}</span>
                <svg viewBox="0 0 24 24" className="size-4 shrink-0 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" strokeLinecap="round" /></svg>
              </summary>
              <div className="mt-3">
                <DepositClaim kind="usdt" id={t.id} claimedAt={t.claimedAt ? formatDate(t.claimedAt) : null} hasProof={!!t.proofImageUrl} customerRef={t.customerRef} />
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
