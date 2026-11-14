'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fmt } from '@/i18n/config';
import { useI18n } from '@/i18n/client';
import { translateError } from '@/i18n/errors';
import { apiRequest } from '@/lib/client-api';

type ApiErr = { error?: string; fields?: Record<string, string[] | undefined> };

function useErrorText() {
  const { d } = useI18n();
  return (data: ApiErr) => {
    const first = data.fields ? Object.values(data.fields).find((v) => v?.length)?.[0] : undefined;
    return translateError(first ?? data.error ?? d.seller.failed, d);
  };
}

function Alert({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (success) return <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>;
  return null;
}

export function ApplyForm({ initial }: { initial?: { shopName: string; contact: string; intro: string } }) {
  const router = useRouter();
  const { d } = useI18n();
  const t = d.seller;
  const errText = useErrorText();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await apiRequest('/api/seller/apply', 'POST', Object.fromEntries(new FormData(e.currentTarget)));
    setPending(false);
    if (!res.ok) return setError(errText(res.data));
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">{t.shopName}</span><input name="shopName" className="input" required maxLength={60} defaultValue={initial?.shopName} /></label>
        <label className="block"><span className="label">{t.contact}</span><input name="contact" className="input" required maxLength={200} placeholder={t.contactHint} defaultValue={initial?.contact} /></label>
      </div>
      <label className="block"><span className="label">{t.intro}</span><textarea name="intro" className="input min-h-24" maxLength={2000} defaultValue={initial?.intro} /></label>
      <Alert error={error} />
      <button className="btn-primary" disabled={pending}>{pending ? t.saving : t.apply}</button>
    </form>
  );
}

export interface SellerProductInput {
  id?: string;
  name: string;
  description: string;
  categoryId: string;
  price: string;
  minQty: number;
  maxQty: number;
  isActive: boolean;
}

export function ProductForm({ initial, categories, approved }: { initial: SellerProductInput; categories: { id: string; label: string }[]; approved: boolean }) {
  const router = useRouter();
  const { d } = useI18n();
  const t = d.seller;
  const errText = useErrorText();
  const [f, setF] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const set = (patch: Partial<SellerProductInput>) => setF((s) => ({ ...s, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    const body = { ...f, price: f.price };
    const res = f.id
      ? await apiRequest(`/api/seller/products/${f.id}`, 'PUT', body)
      : await apiRequest<{ id: string }>('/api/seller/products', 'POST', body);
    setPending(false);
    if (!res.ok) return setError(errText(res.data));
    if (!f.id) {
      router.push(`/dashboard/seller/products/${(res.data as { id: string }).id}?created=1`);
      return;
    }
    setSuccess(t.saved);
    router.refresh();
  }

  async function remove() {
    if (!f.id || !window.confirm(t.deleteConfirm)) return;
    const res = await apiRequest(`/api/seller/products/${f.id}`, 'DELETE');
    if (!res.ok) return setError(errText(res.data));
    router.push('/dashboard/seller/products');
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block"><span className="label">{t.name}</span><input className="input" required minLength={3} maxLength={200} value={f.name} onChange={(e) => set({ name: e.target.value })} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">{t.category}</span>
          <select className="input" required value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
            <option value="" disabled>—</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">{t.price}</span><input className="input tabular-nums" inputMode="decimal" required value={f.price} onChange={(e) => set({ price: e.target.value.replace(/[^\d.]/g, '') })} /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">{t.minQty}</span><input className="input tabular-nums" inputMode="numeric" value={f.minQty} onChange={(e) => set({ minQty: Number(e.target.value.replace(/\D/g, '')) || 1 })} /></label>
        <label className="block"><span className="label">{t.maxQty}</span><input className="input tabular-nums" inputMode="numeric" value={f.maxQty} onChange={(e) => set({ maxQty: Number(e.target.value.replace(/\D/g, '')) || 1 })} /></label>
      </div>
      <label className="block"><span className="label">{t.description}</span><textarea className="input min-h-28" maxLength={5000} value={f.description} onChange={(e) => set({ description: e.target.value })} /></label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
        {t.onSale}{!approved && f.id ? ` · ${t.approvalPENDING}` : ''}
      </label>
      <Alert error={error} success={success} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending}>{pending ? t.saving : f.id ? t.save : t.create}</button>
        {f.id && <button type="button" className="btn-ghost text-red-600" onClick={remove}>{t.delete}</button>}
      </div>
    </form>
  );
}

export function StockBox({ productId }: { productId: string }) {
  const router = useRouter();
  const { d } = useI18n();
  const t = d.seller;
  const errText = useErrorText();
  const [content, setContent] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function importStock() {
    setPending(true);
    setError(null);
    setSuccess(null);
    const res = await apiRequest<{ imported: number; duplicates: number }>(`/api/seller/products/${productId}/stock`, 'POST', { content });
    setPending(false);
    if (!res.ok) return setError(errText(res.data));
    setSuccess(fmt(t.imported, { n: res.data.imported, d: res.data.duplicates }));
    setContent('');
    router.refresh();
  }

  async function clear() {
    if (!window.confirm(t.clearConfirm)) return;
    const res = await apiRequest<{ count: number }>(`/api/seller/products/${productId}/stock`, 'DELETE');
    if (!res.ok) return setError(errText(res.data));
    setSuccess(fmt(t.cleared, { n: res.data.count }));
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <textarea className="input min-h-40 font-mono text-[13px]" placeholder={t.stockHint} value={content} onChange={(e) => setContent(e.target.value)} spellCheck={false} />
      <Alert error={error} success={success} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={pending || !content.trim()} onClick={importStock}>{pending ? t.importing : t.importBtn}</button>
        <button type="button" className="btn-ghost text-red-600" onClick={clear}>{t.clearStock}</button>
      </div>
    </div>
  );
}

export function SellerWithdrawForm({ allowBalance, allowBank, minWithdraw }: { allowBalance: boolean; allowBank: boolean; minWithdraw: string }) {
  const router = useRouter();
  const { d } = useI18n();
  const t = d.seller;
  const errText = useErrorText();
  const [method, setMethod] = useState<'balance' | 'bank'>(allowBalance ? 'balance' : 'bank');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  if (!allowBalance && !allowBank) return null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setPending(true);
    setError(null);
    setSuccess(null);
    const res = await apiRequest('/api/seller/withdraw', 'POST', { ...Object.fromEntries(new FormData(form)), method });
    setPending(false);
    if (!res.ok) return setError(errText(res.data));
    setSuccess(t.withdrawDone);
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-wrap gap-4 text-sm">
        {allowBalance && <label className="flex items-center gap-2"><input type="radio" checked={method === 'balance'} onChange={() => setMethod('balance')} />{t.toBalance}</label>}
        {allowBank && <label className="flex items-center gap-2"><input type="radio" checked={method === 'bank'} onChange={() => setMethod('bank')} />{t.toBank}</label>}
      </div>
      <label className="block">
        <span className="label">{t.amount}</span>
        <input name="amount" className="input tabular-nums" inputMode="decimal" required />
        <span className="mt-1 block text-xs text-zinc-500">{fmt(t.minWithdraw, { min: minWithdraw })}</span>
      </label>
      {method === 'bank' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className="label">{t.bankName}</span><input name="bankName" className="input" required /></label>
          <label className="block"><span className="label">{t.accountNo}</span><input name="accountNo" className="input font-mono" required /></label>
          <label className="block"><span className="label">{t.accountName}</span><input name="accountName" className="input" required /></label>
        </div>
      )}
      <Alert error={error} success={success} />
      <button className="btn-primary" disabled={pending}>{pending ? t.saving : t.withdraw}</button>
    </form>
  );
}
