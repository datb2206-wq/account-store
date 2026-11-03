'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { useI18n } from '@/i18n/client';
import { fmt } from '@/i18n/config';
import { translateError } from '@/i18n/errors';
import { apiRequest } from '@/lib/client-api';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp';

// claimedAt: thời điểm khách đã báo, định dạng sẵn ở server (tránh lệch hydration do múi giờ)
// Khách báo đã thanh toán + mã giao dịch (ngân hàng) / TxID (USDT) hoặc ảnh biên lai -> trạng thái "Chờ duyệt"
export function DepositClaim({
  kind,
  id,
  claimedAt,
  hasProof,
  customerRef,
}: {
  kind: 'bank' | 'usdt';
  id: string;
  claimedAt: string | null;
  hasProof: boolean;
  customerRef: string | null;
}) {
  const router = useRouter();
  const { d } = useI18n();
  const t = kind === 'usdt' ? d.usdtClaim : d.bankClaim;
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  function pick(f: File | null) {
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    if (f && f.size > MAX_BYTES) {
      setError(d.errors.receiptTooLarge);
      f = null;
    } else if (f && !ACCEPT.split(',').includes(f.type)) {
      setError(d.errors.receiptType);
      f = null;
    }
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
    if (!f && inputRef.current) inputRef.current.value = '';
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const body = new FormData();
    if (file) body.set('proof', file);
    if (reference.trim()) body.set('reference', reference.trim());
    const res = await apiRequest(`/api/deposits/${id}/claim`, 'POST', body);
    setPending(false);
    if (!res.ok) {
      setError(res.data.error ? translateError(res.data.error, d) : t.failed);
      return;
    }
    pick(null);
    setReference('');
    setReplacing(false);
    router.refresh();
  }

  const form = (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor={`${kind}-ref`} className="label">{t.reference}</label>
        <input id={`${kind}-ref`} className="input font-mono text-sm" maxLength={100} placeholder={t.referencePlaceholder} value={reference} onChange={(e) => setReference(e.target.value)} spellCheck={false} />
      </div>
      <div>
        <p className="label">{t.receipt}</p>
        {preview ? (
          <div className="flex items-center gap-3 rounded-lg border border-zinc-200 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="size-16 rounded-md object-cover" />
            <span className="min-w-0 flex-1 truncate text-sm text-zinc-600">{file?.name}</span>
            <button type="button" onClick={() => pick(null)} className="btn-ghost px-2 text-xs">{t.remove}</button>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-zinc-300 px-4 py-5 text-center transition hover:border-blue-400 hover:bg-blue-50/40">
            <span className="text-sm font-medium text-blue-600">{t.choose}</span>
            <span className="text-xs text-zinc-500">{t.receiptHint}</span>
            <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </label>
        )}
      </div>
      <button type="submit" disabled={pending || (!file && !reference.trim())} className="btn-primary w-full">
        {pending ? t.submitting : claimedAt ? t.sendReceipt : t.submit}
      </button>
    </form>
  );

  if (claimedAt) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg bg-sky-50 p-4 text-sm text-sky-900">
          <p className="font-semibold">{t.awaitingTitle}</p>
          <p className="mt-1">{fmt(t.awaitingText, { date: claimedAt })}</p>
          {customerRef && <p className="mt-1 break-all">{t.reference}: <b className="font-mono">{customerRef}</b></p>}
          <p className="mt-2 flex flex-wrap gap-3">
            {hasProof ? (
              <a href={`/api/deposits/${id}/proof`} target="_blank" rel="noreferrer" className="font-medium underline">{t.viewReceipt}</a>
            ) : (
              <span className="text-sky-700">{t.noReceipt}</span>
            )}
            {!replacing && (
              <button type="button" onClick={() => setReplacing(true)} className="font-medium underline">{hasProof ? t.replace : t.addReceipt}</button>
            )}
          </p>
        </div>
        {replacing && form}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="font-semibold">{t.title}</p>
        <p className="text-sm text-zinc-500">{t.hint}</p>
      </div>
      {form}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
