'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/lib/client-api';
import { FormAlert, FormField } from './form-field';

// Duyệt / từ chối 1 yêu cầu nạp đang PENDING hoặc EXPIRED
export function ReviewPanel({
  id,
  amount,
  isBank,
  customerRef,
  needsTxHash,
}: {
  id: string;
  amount: string;
  isBank: boolean;
  customerRef: string | null;
  needsTxHash: boolean;
}) {
  const router = useRouter();
  const [approveAmount, setApproveAmount] = useState(amount);
  // Mã khách khai chỉ là gợi ý, admin đối chiếu sao kê rồi mới duyệt
  const [bankRef, setBankRef] = useState(customerRef ?? '');
  const [txHash, setTxHash] = useState('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: 'approve' | 'reject') {
    const msg =
      action === 'approve'
        ? `Xác nhận CỘNG $${approveAmount} vào số dư khách?`
        : 'Xác nhận TỪ CHỐI yêu cầu nạp này?';
    if (!window.confirm(msg)) return;
    setPending(true);
    setError(null);
    const body = action === 'approve' ? { amount: approveAmount, bankRef, txHash, note } : { note };
    const res = await apiRequest(`/api/admin/transactions/${id}/${action}`, 'POST', body);
    setPending(false);
    if (!res.ok) {
      setError(res.data.error ?? Object.values(res.data.fields ?? {})[0]?.[0] ?? 'Thao tác thất bại');
      return;
    }
    router.refresh();
  }

  return (
    <section className="card space-y-4">
      <h2 className="font-semibold">Duyệt yêu cầu nạp</h2>
      <FormAlert error={error} />
      <FormField label="Số tiền cộng (USD)" htmlFor="rv-amount" hint="Sửa nếu khách chuyển lệch so với yêu cầu">
        <input id="rv-amount" className="input" inputMode="decimal" value={approveAmount} onChange={(e) => setApproveAmount(e.target.value)} />
      </FormField>
      {isBank && (
        <FormField label="Mã giao dịch ngân hàng" htmlFor="rv-ref" hint="Không bắt buộc — dùng để chống duyệt trùng 1 giao dịch">
          <input id="rv-ref" className="input" value={bankRef} onChange={(e) => setBankRef(e.target.value)} />
        </FormField>
      )}
      {needsTxHash && (
        <FormField label="TxID" htmlFor="rv-tx" hint="Bắt buộc khi duyệt tay: 1 TxID chỉ được cộng tiền 1 lần">
          <input id="rv-tx" className="input font-mono text-xs" value={txHash} onChange={(e) => setTxHash(e.target.value)} spellCheck={false} />
        </FormField>
      )}
      <FormField label="Ghi chú" htmlFor="rv-note" hint="Bắt buộc khi từ chối">
        <textarea id="rv-note" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </FormField>
      <div className="flex gap-2">
        <button type="button" className="btn-primary flex-1" disabled={pending} onClick={() => act('approve')}>Duyệt &amp; cộng tiền</button>
        <button type="button" className="btn-ghost flex-1 border border-red-200 text-red-600 hover:bg-red-50" disabled={pending} onClick={() => act('reject')}>Từ chối</button>
      </div>
    </section>
  );
}
