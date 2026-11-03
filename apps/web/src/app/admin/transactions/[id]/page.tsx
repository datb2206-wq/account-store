import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@accszone/database';
import { ReviewPanel } from '@/components/admin/review-panel';
import { Badge } from '@/components/badge';
import { UsdtVerify } from '@/components/deposit/usdt-verify';
import { requireStaff } from '@/lib/auth';
import { explorerTxUrl } from '@/lib/chain-links';
import { getConfig } from '@accszone/core';
import { formatDate, formatOriginal, formatUsd, METHOD_LABEL } from '@/lib/format';

export const metadata: Metadata = { title: 'Chi tiết giao dịch' };

export default async function AdminTransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const [t, logs, sameRef] = await Promise.all([
    prisma.transaction.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, balance: true } },
        reviewedBy: { select: { email: true } },
        order: { select: { code: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: { entity: 'Transaction', entityId: id },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { email: true } } },
    }),
    // Cùng 1 mã giao dịch được khai ở yêu cầu khác: dấu hiệu dùng lại biên lai
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM transactions a JOIN transactions b ON a."customerRef" = b."customerRef" AND a.id <> b.id
      WHERE a.id = ${id}`,
  ]);
  if (!t) notFound();
  const duplicateRefs = Number(sameRef[0]?.n ?? 0);

  const isUsdt = t.method === 'USDT_TRC20' || t.method === 'USDT_BEP20';
  const reviewable = t.type === 'DEPOSIT' && (t.status === 'PENDING' || t.status === 'EXPIRED');
  const required = isUsdt ? (await getConfig(t.network === 'BEP20' ? 'usdt.bep20' : 'usdt.trc20')).minConfirmations : 0;

  const fields: [string, React.ReactNode][] = [
    ['ID', <span key="id" className="font-mono text-xs">{t.id}</span>],
    ['Người dùng', <Link key="u" href={`/admin/transactions?q=${encodeURIComponent(t.user.email)}`} className="text-blue-600 hover:underline">{t.user.email}</Link>],
    ['Số dư hiện tại của khách', formatUsd(t.user.balance)],
    ['Loại / Phương thức', `${t.type} · ${METHOD_LABEL[t.method]}`],
    ['Số tiền (USD)', <span key="a" className={`font-semibold ${t.amount.isNegative() ? 'text-red-600' : 'text-emerald-600'}`}>{formatUsd(t.amount)}</span>],
    ['Số tiền gốc', formatOriginal(t.originalAmount, t.originalCurrency)],
    ['Tỷ giá', t.exchangeRate ? `1 USD = ${Number(t.exchangeRate).toLocaleString('en-US')} ${t.originalCurrency}` : '—'],
    ['Số dư trước → sau', t.balanceBefore && t.balanceAfter ? `${formatUsd(t.balanceBefore)} → ${formatUsd(t.balanceAfter)}` : '—'],
    ['Mã nội dung CK', t.transferCode ? <span key="c" className="font-mono">{t.transferCode}</span> : '—'],
    ['Mã GD ngân hàng', t.bankRef ?? '—'],
    ...(t.type === 'DEPOSIT'
      ? ([[isUsdt ? 'TxID khách khai' : 'Mã GD khách khai', t.customerRef ? (
          <span key="cr" className="font-mono text-xs">
            {t.customerRef}
            {duplicateRefs > 0 && <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-red-700">Trùng với {duplicateRefs} yêu cầu khác</span>}
          </span>
        ) : '—']] as [string, React.ReactNode][])
      : []),
    ...(t.type === 'DEPOSIT'
      ? ([['Khách báo đã chuyển', t.claimedAt ? <span key="cl" className="font-medium text-sky-700">{formatDate(t.claimedAt)}</span> : 'Chưa']] as [string, React.ReactNode][])
      : []),
    ['Mạng / Ví nhận', t.network ? <span key="n" className="font-mono text-xs">{t.network} · {t.toAddress}</span> : '—'],
    ['TxID', t.txHash ? <a key="h" href={explorerTxUrl(t.network, t.txHash)} target="_blank" rel="noreferrer" className="font-mono text-xs break-all text-blue-600 hover:underline">{t.txHash}</a> : '—'],
    ['Ví gửi', t.fromAddress ? <span key="f" className="font-mono text-xs">{t.fromAddress}</span> : '—'],
    ['Confirmations', t.confirmations ?? '—'],
    ['Đơn hàng', t.order?.code ?? '—'],
    ['Tạo lúc', formatDate(t.createdAt)],
    ['Hết hạn', formatDate(t.expiresAt)],
    ['Người duyệt', t.reviewedBy ? `${t.reviewedBy.email} · ${formatDate(t.reviewedAt)}` : t.status === 'COMPLETED' && t.type === 'DEPOSIT' ? 'Tự động' : '—'],
    ['Ghi chú', t.note ?? '—'],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/transactions" className="text-sm text-zinc-500 hover:underline">← Giao dịch</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{t.type} · {formatUsd(t.amount)}</h1>
          <Badge value={t.status} />
          {t.status === 'PENDING' && t.claimedAt && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">Khách đã báo chuyển khoản</span>}
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="card divide-y divide-zinc-100 p-0">
            {fields.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[180px_1fr] gap-3 px-4 py-2.5 text-sm">
                <span className="text-zinc-500">{label}</span>
                <span className="min-w-0">{value}</span>
              </div>
            ))}
          </section>

          {t.proofImageUrl && (
            <section className="card space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Biên lai khách tải lên</h2>
                <a href={`/api/deposits/${t.id}/proof`} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">Mở ảnh gốc ↗</a>
              </div>
              <p className="text-xs text-zinc-500">
                {isUsdt
                  ? <>Tra TxID trên blockchain, đối chiếu ví nhận <b className="font-mono">{t.toAddress}</b> và số tiền thực nhận trước khi duyệt.</>
                  : <>Đối chiếu số tiền, nội dung <b className="font-mono">{t.transferCode}</b> và tài khoản nhận với sao kê ngân hàng trước khi duyệt.</>}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/deposits/${t.id}/proof`} alt="Biên lai khách tải lên" className="max-h-[480px] rounded-lg border border-zinc-200 object-contain" />
            </section>
          )}

          {t.metadata !== null && (
            <section className="card">
              <h2 className="mb-2 font-semibold">Metadata</h2>
              <pre className="overflow-x-auto rounded-lg bg-zinc-50 p-3 text-xs">{JSON.stringify(t.metadata, null, 2)}</pre>
            </section>
          )}

          <section className="card">
            <h2 className="mb-3 font-semibold">Lịch sử xử lý (audit log)</h2>
            {logs.length === 0 ? (
              <p className="text-sm text-zinc-500">Chưa có thao tác nào.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {logs.map((log) => (
                  <li key={log.id} className="flex flex-wrap gap-x-2">
                    <span className="text-zinc-400">{formatDate(log.createdAt)}</span>
                    <span className="font-mono text-xs font-medium">{log.action}</span>
                    <span className="text-zinc-600">bởi {log.actor?.email ?? 'hệ thống'}</span>
                    {log.ip && <span className="text-zinc-400">· {log.ip}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {reviewable && (
          <div className="space-y-6">
            {isUsdt && (
              <section className="card space-y-2">
                <h2 className="font-semibold">Kiểm tra on-chain</h2>
                <p className="text-xs text-zinc-500">Nhập TxID khách gửi qua kênh hỗ trợ. Hệ thống tự cộng tiền nếu khớp số tiền & đủ confirmations.</p>
                <UsdtVerify endpoint={`/api/admin/transactions/${t.id}/verify`} network={t.network ?? 'TRC20'} txHash={t.txHash} confirmations={t.confirmations} required={required} />
              </section>
            )}
            <ReviewPanel id={t.id} amount={t.amount.toString()} isBank={t.method === 'BANK_TRANSFER'} customerRef={t.customerRef} needsTxHash={isUsdt && !t.txHash} />
          </div>
        )}
      </div>
    </div>
  );
}
