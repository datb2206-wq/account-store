'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/badge';
import { apiRequest } from '@/lib/client-api';
import { FormAlert, FormField } from './form-field';

function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function run(url: string, body: unknown, confirmText: string, onOk: (data: Record<string, unknown>) => string) {
    if (!window.confirm(confirmText)) return false;
    setPending(true);
    setError(null);
    setSuccess(null);
    const res = await apiRequest<Record<string, unknown>>(url, 'POST', body);
    setPending(false);
    if (!res.ok) {
      setError(res.data.error ?? Object.values(res.data.fields ?? {})[0]?.[0] ?? 'Thao tác thất bại');
      return false;
    }
    setSuccess(onOk(res.data));
    router.refresh();
    return true;
  }
  return { pending, error, success, run };
}

const OUTCOME_LABEL: Record<string, string> = {
  delivered: 'Đã giao đủ',
  partial: 'Đã giao một phần và hoàn tiền phần thiếu',
  refunded: 'Đã hoàn tiền',
};

const RETRY_LABEL: Record<string, string> = {
  promoted: 'Job đang chờ backoff đã được chạy ngay',
  'already-queued': 'Job đang chạy/đợi trong hàng đợi',
  queued: 'Đã đưa vào hàng đợi',
};

// Đơn RESELLER đang PENDING: kiểm tra lại ngay + giao tay
export function PendingOrderActions({ orderId, quantity, hasExternalOrder }: { orderId: string; quantity: number; hasExternalOrder: boolean }) {
  const { pending, error, success, run } = useAction();
  const [accounts, setAccounts] = useState('');
  const lineCount = accounts.split(/\r?\n/).filter((l) => l.trim()).length;

  return (
    <section className="card space-y-4">
      <h2 className="font-semibold">Xử lý đơn đang chờ</h2>
      <FormAlert error={error} success={success} />
      <button
        type="button"
        className="btn-primary w-full"
        disabled={pending}
        onClick={() =>
          run(`/api/admin/orders/${orderId}/retry`, {}, 'Chạy lại job giao hàng cho đơn này ngay bây giờ?', (d) =>
            `${RETRY_LABEL[String(d.result)] ?? d.result}${d.workerOnline ? '' : ' — ⚠ worker KHÔNG chạy!'}. Tải lại sau vài giây để xem kết quả.`,
          )
        }
      >
        ⟳ Kiểm tra lại ngay với web gốc
      </button>

      <div className="space-y-2 border-t border-zinc-100 pt-4">
        <FormField label={`Giao tay (${lineCount}/${quantity} tài khoản)`} htmlFor="manual-accounts" hint="Mỗi dòng 1 tài khoản. Thiếu thì tự hoàn tiền phần thiếu.">
          <textarea id="manual-accounts" className="input font-mono text-xs" rows={5} value={accounts} onChange={(e) => setAccounts(e.target.value)} spellCheck={false} />
        </FormField>
        {hasExternalOrder && (
          <p className="text-xs text-amber-700">⚠ Đơn đã được đặt bên web gốc. Giao tay xong, nếu web gốc giao tiếp thì hàng đó sẽ không được dùng.</p>
        )}
        <button
          type="button"
          className="btn-ghost w-full border border-zinc-200"
          disabled={pending || lineCount === 0}
          onClick={async () => {
            const ok = await run(`/api/admin/orders/${orderId}/deliver`, { accounts }, `Giao ${Math.min(lineCount, quantity)}/${quantity} tài khoản cho khách?`, (d) => OUTCOME_LABEL[String(d.outcome)] ?? String(d.outcome));
            if (ok) setAccounts('');
          }}
        >
          Giao tay cho khách
        </button>
      </div>
    </section>
  );
}

// Hoàn tiền thủ công (SUPER_ADMIN)
export function RefundPanel({ orderId, remaining, pendingOnlyFull }: { orderId: string; remaining: string; pendingOnlyFull: boolean }) {
  const { pending, error, success, run } = useAction();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Hoàn tiền</h2>
        <Badge value={`Còn hoàn được $${Number(remaining).toFixed(4).replace(/\.?0+$/, '')}`} tone="gray" />
      </div>
      <FormAlert error={error} success={success} />
      {!pendingOnlyFull && (
        <FormField label="Số tiền (USD)" htmlFor="refund-amount" hint="Bỏ trống = hoàn toàn bộ phần còn lại (đơn chuyển REFUNDED)">
          <input id="refund-amount" className="input" inputMode="decimal" placeholder={remaining} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
      )}
      <FormField label="Lý do (nội bộ)" htmlFor="refund-reason">
        <textarea id="refund-reason" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </FormField>
      <button
        type="button"
        className="btn-ghost w-full border border-red-200 text-red-600 hover:bg-red-50"
        disabled={pending}
        onClick={async () => {
          const ok = await run(
            `/api/admin/orders/${orderId}/refund`,
            { amount: pendingOnlyFull ? undefined : amount, reason },
            `Hoàn $${amount || remaining} vào số dư khách?${pendingOnlyFull ? ' Đơn sẽ bị đóng (REFUNDED).' : ''}`,
            (d) => `Đã hoàn $${d.amount}${d.full ? ' — đơn chuyển REFUNDED' : ''}`,
          );
          if (ok) {
            setAmount('');
            setReason('');
          }
        }}
      >
        {pendingOnlyFull ? 'Hoàn toàn bộ & đóng đơn' : 'Hoàn tiền'}
      </button>
    </section>
  );
}

export interface OrderItemRow {
  id: string;
  status: string;
  soldAt: string;
}

// Danh sách tài khoản của đơn: xem nội dung (SUPER_ADMIN) + chọn để đổi bảo hành
export function OrderItems({ orderId, items, canReveal, canReplace }: { orderId: string; items: OrderItemRow[]; canReveal: boolean; canReplace: boolean }) {
  const { pending, error, success, run } = useAction();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');

  async function reveal(id: string) {
    if (revealed[id] !== undefined) return setRevealed(({ [id]: _, ...rest }) => rest);
    const res = await apiRequest<{ content: string }>(`/api/admin/stock/${id}/reveal`, 'POST');
    if (!res.ok) return window.alert(res.data.error ?? 'Không xem được');
    setRevealed((r) => ({ ...r, [id]: res.data.content }));
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Tài khoản đã giao ({items.filter((i) => i.status === 'SOLD').length})</h2>
      <FormAlert error={error} success={success} />
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">Chưa có tài khoản nào.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>{canReplace && <th className="w-8" />}<th>ID</th><th>Trạng thái</th><th>Giao lúc</th>{canReveal && <th className="text-right">Nội dung</th>}</tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={item.status === 'INVALID' ? 'opacity-50' : undefined}>
                  {canReplace && (
                    <td>
                      <input type="checkbox" aria-label={`Chọn ${item.id}`} disabled={item.status !== 'SOLD'} checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                    </td>
                  )}
                  <td className="font-mono text-xs text-zinc-500">{item.id}</td>
                  <td><Badge value={item.status === 'INVALID' ? 'ĐÃ ĐỔI' : item.status} tone={item.status === 'SOLD' ? 'blue' : 'gray'} /></td>
                  <td className="text-zinc-500">{item.soldAt}</td>
                  {canReveal && (
                    <td className="text-right">
                      {revealed[item.id] !== undefined && <code className="mr-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs break-all">{revealed[item.id]}</code>}
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => reveal(item.id)}>{revealed[item.id] !== undefined ? 'Ẩn' : 'Xem'}</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canReplace && selected.size > 0 && (
        <div className="space-y-2 rounded-lg bg-blue-50 p-3">
          <p className="text-sm font-medium text-blue-800">Đổi {selected.size} tài khoản lỗi bằng tài khoản mới từ kho</p>
          <input className="input" placeholder="Lý do (VD: khách báo sai mật khẩu)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={async () => {
              const ok = await run(`/api/admin/orders/${orderId}/replace`, { itemIds: [...selected], reason }, `Đổi ${selected.size} tài khoản cho khách?`, (d) => `Đã đổi ${d.replaced} tài khoản`);
              if (ok) {
                setSelected(new Set());
                setReason('');
              }
            }}
          >
            Đổi hàng
          </button>
        </div>
      )}
    </section>
  );
}
