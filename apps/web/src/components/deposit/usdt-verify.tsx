'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { explorerTxUrl, shortHash } from '@/lib/chain-links';
import { useI18n } from '@/i18n/client';
import { fmt } from '@/i18n/config';
import { translateError } from '@/i18n/errors';
import { rich } from '@/i18n/rich';
import { apiRequest } from '@/lib/client-api';

type VerifyResponse = { status: 'completed' } | { status: 'confirming'; confirmations: number; required: number };

// Gửi TxID hoặc kiểm tra lại số confirmations. `endpoint` khác nhau cho khách / admin.
export function UsdtVerify({
  endpoint,
  network,
  txHash,
  confirmations,
  required,
}: {
  endpoint: string;
  network: string;
  txHash: string | null;
  confirmations: number | null;
  required: number;
}) {
  const router = useRouter();
  const { d } = useI18n();
  const t = d.usdtVerify;
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setPending(true);
    setError(null);
    setInfo(null);
    const res = await apiRequest<VerifyResponse>(endpoint, 'POST', txHash ? {} : { txHash: input });
    setPending(false);
    if (!res.ok) {
      setError(res.data.error ? translateError(res.data.error, d) : t.failed);
      return;
    }
    if (res.data.status === 'confirming') {
      setInfo(fmt(t.confirming, { n: res.data.confirmations, required: res.data.required }));
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {txHash ? (
        <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            {rich(t.waiting, {
              tx: <a href={explorerTxUrl(network, txHash)} target="_blank" rel="noreferrer" className="font-mono underline">{shortHash(txHash)}</a>,
              n: <b>{confirmations ?? 0}/{required}</b>,
            })}
          </p>
          <button type="button" onClick={() => submit()} disabled={pending} className="btn-primary">
            {pending ? t.checking : t.checkAgain}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          <label htmlFor="txid" className="label">{t.txLabel}</label>
          <input id="txid" className="input font-mono text-xs" placeholder={network === 'BEP20' ? '0x…' : t.txPlaceholder} value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} />
          <button type="submit" disabled={pending || input.trim().length < 64} className="btn-primary w-full">
            {pending ? t.verifying : t.verify}
          </button>
        </form>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {info && <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">{info}</p>}
    </div>
  );
}
