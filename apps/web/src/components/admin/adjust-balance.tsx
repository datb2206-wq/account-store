'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { apiRequest } from '@/lib/client-api';
import { FormAlert, FormField } from './form-field';

export function AdjustBalanceButton() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState({ email: '', amount: '', note: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[] | undefined>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!window.confirm(`${Number(values.amount) > 0 ? 'Cộng' : 'Trừ'} $${values.amount.replace('-', '')} cho ${values.email}?`)) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    setFields({});
    const res = await apiRequest<{ balanceAfter: string }>('/api/admin/adjustments', 'POST', values);
    setPending(false);
    if (!res.ok) {
      setError(res.data.error ?? 'Thất bại');
      setFields(res.data.fields ?? {});
      return;
    }
    setSuccess(`Đã điều chỉnh. Số dư mới: $${res.data.balanceAfter}`);
    setValues({ email: '', amount: '', note: '' });
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn-ghost border border-zinc-200" onClick={() => { setError(null); setSuccess(null); dialogRef.current?.showModal(); }}>
        ± Điều chỉnh số dư
      </button>
      <dialog ref={dialogRef} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl bg-white p-0 shadow-2xl backdrop:bg-zinc-900/50">
        <form onSubmit={submit} className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Điều chỉnh số dư</h2>
            <button type="button" className="text-zinc-400 hover:text-zinc-700" onClick={() => dialogRef.current?.close()}>✕</button>
          </div>
          <p className="text-xs text-zinc-500">Ghi vào sổ cái dạng ADJUSTMENT kèm audit log. Số âm để trừ tiền (không cho trừ quá số dư).</p>
          <FormAlert error={error} success={success} />
          <FormField label="Email người dùng" htmlFor="adj-email" error={fields.email}>
            <input id="adj-email" type="email" className="input" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} />
          </FormField>
          <FormField label="Số tiền (USD)" htmlFor="adj-amount" error={fields.amount} hint="VD: 10 hoặc -5.5">
            <input id="adj-amount" className="input" inputMode="decimal" value={values.amount} onChange={(e) => setValues({ ...values, amount: e.target.value })} />
          </FormField>
          <FormField label="Lý do" htmlFor="adj-note" error={fields.note}>
            <textarea id="adj-note" className="input" rows={2} value={values.note} onChange={(e) => setValues({ ...values, note: e.target.value })} />
          </FormField>
          <button type="submit" className="btn-primary w-full" disabled={pending}>{pending ? 'Đang xử lý…' : 'Xác nhận'}</button>
        </form>
      </dialog>
    </>
  );
}
