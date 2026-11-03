import { prisma } from '@accszone/database';
import { adminRoute } from '@/lib/admin-route';
import { parseTxFilters, txWhere } from '@/lib/admin-transactions';
import { writeAudit } from '@/lib/audit';
import { explorerTxUrl } from '@/lib/chain-links';
import { getClientIp } from '@/lib/http';

// Giới hạn mỗi file: đủ cho đối soát theo tháng mà không giữ quá nhiều dòng trong RAM
const MAX_ROWS = 50_000;

// Ô bắt đầu bằng = + - @ bị Excel hiểu là công thức -> thêm ' phía trước (chống CSV injection)
function cell(value: unknown) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Xuất CSV theo đúng bộ lọc đang xem ở Admin > Giao dịch (VD log TxID USDT để đối soát với ví)
export const GET = adminRoute(async (req, _ctx, user) => {
  const filters = parseTxFilters(Object.fromEntries(req.nextUrl.searchParams));
  const rows = await prisma.transaction.findMany({
    where: txWhere(filters),
    orderBy: { createdAt: 'desc' },
    take: MAX_ROWS,
    include: { user: { select: { email: true } }, order: { select: { code: true } }, reviewedBy: { select: { email: true } } },
  });

  const header = [
    'created_at', 'id', 'user', 'type', 'method', 'status', 'amount_usd', 'original_amount', 'original_currency',
    'network', 'tx_hash', 'explorer_url', 'from_address', 'to_address', 'confirmations',
    'transfer_code', 'bank_ref', 'customer_ref', 'order_code', 'reviewed_by', 'reviewed_at', 'note',
  ];
  const lines = rows.map((t) =>
    [
      t.createdAt.toISOString(), t.id, t.user.email, t.type, t.method, t.status, t.amount.toString(),
      t.originalAmount?.toString(), t.originalCurrency, t.network, t.txHash, t.txHash ? explorerTxUrl(t.network, t.txHash) : '',
      t.fromAddress, t.toAddress, t.confirmations, t.transferCode, t.bankRef, t.customerRef, t.order?.code,
      t.reviewedBy?.email, t.reviewedAt?.toISOString(), t.note,
    ].map(cell).join(','),
  );

  await writeAudit({ actorId: user.id, action: 'transaction.export', entity: 'Transaction', after: { filters, rows: rows.length }, ip: getClientIp(req) });

  const stamp = new Date().toISOString().slice(0, 10);
  // BOM: Excel mở đúng UTF-8
  return new Response(`﻿${[header.join(','), ...lines].join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="transactions-${stamp}.csv"`,
      'Cache-Control': 'no-store',
      'X-Row-Limit-Reached': rows.length === MAX_ROWS ? '1' : '0',
    },
  });
});
