'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fmt } from '@/i18n/config';
import { useI18n } from '@/i18n/client';
import { translateError } from '@/i18n/errors';
import { apiRequest } from '@/lib/client-api';

export function CopyLink({ link }: { link: string }) {
  const { d } = useI18n();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }
  return (
    <div className="flex gap-2">
      <input readOnly value={link} className="input font-mono text-sm" onFocus={(e) => e.currentTarget.select()} translate="no" />
      <button type="button" className="btn-primary shrink-0" onClick={copy}>{copied ? d.affiliate.copied : d.affiliate.copy}</button>
    </div>
  );
}

export function WithdrawForm({ allowBalance, allowBank, minWithdraw }: { allowBalance: boolean; allowBank: boolean; minWithdraw: string }) {
  const router = useRouter();
  const { d } = useI18n();
  const t = d.affiliate;
  const [method, setMethod] = useState<'balance' | 'bank'>(allowBalance ? 'balance' : 'bank');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setPending(true);
    setError(null);
    setDone(false);
    const res = await apiRequest('/api/affiliate/withdraw', 'POST', { ...data, method });
    setPending(false);
    if (!res.ok) {
      const first = Object.values(res.data.fields ?? {}).flat()[0];
      setError(translateError(first ?? res.data.error ?? 'Network error, please try again', d));
      return;
    }
    setDone(true);
    e.currentTarget?.reset();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {done && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{t.withdrawn}</p>}
      <div>
        <span className="label">{t.method}</span>
        <div className="flex flex-wrap gap-4 text-sm">
          {allowBalance && (
            <label className="flex items-center gap-2"><input type="radio" checked={method === 'balance'} onChange={() => setMethod('balance')} />{t.toBalance}</label>
          )}
          {allowBank && (
            <label className="flex items-center gap-2"><input type="radio" checked={method === 'bank'} onChange={() => setMethod('bank')} />{t.toBank}</label>
          )}
        </div>
      </div>
      {method === 'bank' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className="label">{t.bankName}</span><input name="bankName" className="input" maxLength={100} required /></label>
          <label className="block"><span className="label">{t.accountNo}</span><input name="accountNo" className="input" maxLength={50} required /></label>
          <label className="block"><span className="label">{t.accountName}</span><input name="accountName" className="input" maxLength={100} required /></label>
        </div>
      )}
      <label className="block max-w-xs">
        <span className="label">{t.amount}</span>
        <input name="amount" className="input tabular-nums" inputMode="decimal" required />
        <span className="mt-1 block text-xs text-zinc-500">{fmt(t.minWithdraw, { min: minWithdraw })}</span>
      </label>
      <button type="submit" className="btn-primary" disabled={pending}>{pending ? d.auth.wait : t.submit}</button>
    </form>
  );
}
