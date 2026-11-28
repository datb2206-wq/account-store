'use client';

import { useState } from 'react';
import { apiRequest } from '@/lib/client-api';

export function ApiKeyBox({ initialKey, t }: { initialKey: string; t: { show: string; hide: string; copy: string; copied: string; regen: string; regenConfirm: string; regenDone: string } }) {
  const [key, setKey] = useState(initialKey);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function copy() {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }
  async function regen() {
    if (!confirm(t.regenConfirm)) return;
    setBusy(true);
    setMsg('');
    const res = await apiRequest<{ key: string }>('/api/account/api-key', 'POST');
    setBusy(false);
    if (res.ok && res.data.key) {
      setKey(res.data.key);
      setVisible(true);
      setMsg(t.regenDone);
    } else setMsg(res.data.error ?? 'Error');
  }

  const masked = `${key.slice(0, 6)}${'•'.repeat(22)}${key.slice(-4)}`;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input readOnly value={visible ? key : masked} className="input min-w-0 flex-1 font-mono text-sm" onFocus={(e) => visible && e.currentTarget.select()} translate="no" />
        <button type="button" className="btn-ghost border border-zinc-200" onClick={() => setVisible((v) => !v)}>{visible ? t.hide : t.show}</button>
        <button type="button" className="btn-primary" onClick={copy}>{copied ? t.copied : t.copy}</button>
        <button type="button" className="btn-ghost border border-red-200 text-red-600 hover:bg-red-50" onClick={regen} disabled={busy}>{t.regen}</button>
      </div>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
    </div>
  );
}
