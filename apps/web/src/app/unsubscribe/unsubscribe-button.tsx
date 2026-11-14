'use client';

import { useState } from 'react';

export function UnsubscribeButton({ u, t }: { u: string; t: string }) {
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');

  async function confirm() {
    setState('pending');
    const res = await fetch('/api/unsubscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ u, t }) }).catch(() => null);
    setState(res?.ok ? 'done' : 'error');
  }

  if (state === 'done') return <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Đã hủy nhận email. / You have been unsubscribed.</p>;
  return (
    <>
      {state === 'error' && <p className="text-sm text-red-600">Có lỗi, vui lòng thử lại. / Something went wrong.</p>}
      <button type="button" className="btn-primary w-full" disabled={state === 'pending'} onClick={confirm}>
        {state === 'pending' ? '…' : 'Xác nhận hủy nhận email / Confirm'}
      </button>
    </>
  );
}
