'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AffiliateSettings } from '@accszone/core'; // chỉ kiểu
import { apiRequest } from '@/lib/client-api';
import { FormAlert } from './form-field';

export function AffiliateSettingsForm({ initial }: { initial: AffiliateSettings }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const set = (patch: Partial<AffiliateSettings>) => setF((s) => ({ ...s, ...patch }));
  const num = (v: string) => Number(v.replace(/[^\d.]/g, '')) || 0;

  async function save() {
    setPending(true);
    setError(null);
    setSuccess(null);
    const res = await apiRequest('/api/admin/affiliate', 'PUT', f);
    setPending(false);
    if (!res.ok) return setError(res.data.error ?? 'Lưu thất bại');
    setSuccess('Đã lưu cấu hình Affiliate.');
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <FormAlert error={error} success={success} />
      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
        <input type="checkbox" checked={f.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        Bật chương trình giới thiệu (khách thấy mục &quot;Affiliate&quot; trong trang tài khoản)
      </label>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">% hoa hồng</span>
          <input className="input tabular-nums" inputMode="decimal" value={f.percent} onChange={(e) => set({ percent: num(e.target.value) })} />
          <span className="mt-1 block text-xs text-zinc-400">Trên số tiền đơn thực trả của người được giới thiệu (tối đa 50%).</span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Rút tối thiểu (USD)</span>
          <input className="input tabular-nums" inputMode="decimal" value={f.minWithdraw} onChange={(e) => set({ minWithdraw: num(e.target.value) })} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Link giới thiệu hiệu lực</span>
          <div className="flex">
            <input className="input rounded-r-none tabular-nums" inputMode="numeric" value={f.cookieDays} onChange={(e) => set({ cookieDays: Math.round(num(e.target.value)) })} />
            <span className="grid place-items-center rounded-r-lg border border-l-0 border-zinc-300 bg-zinc-50 px-3 text-zinc-500">ngày</span>
          </div>
        </label>
        <div className="space-y-2 text-sm">
          <span className="block font-medium text-zinc-700">Cho phép rút</span>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.allowBalance} onChange={(e) => set({ allowBalance: e.target.checked })} />Vào số dư mua hàng (tức thì)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.allowBank} onChange={(e) => set({ allowBank: e.target.checked })} />Về ngân hàng (admin duyệt)</label>
        </div>
      </div>
      <button type="button" className="btn-primary" disabled={pending} onClick={save}>{pending ? 'Đang lưu…' : 'Lưu cấu hình'}</button>
    </div>
  );
}

export function WithdrawalActions({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function review(approve: boolean) {
    const note = approve
      ? window.confirm(`Xác nhận ĐÃ CHUYỂN KHOẢN ${label}?`) ? '' : null
      : window.prompt(`Lý do từ chối (hoa hồng sẽ được trả lại cho khách):`, '');
    if (note === null) return;
    setPending(true);
    const res = await apiRequest(`/api/admin/affiliate/withdrawals/${id}`, 'POST', { approve, note });
    setPending(false);
    if (!res.ok) window.alert(res.data.error ?? 'Thao tác thất bại');
    router.refresh();
  }
  return (
    <span className="inline-flex gap-1">
      <button type="button" disabled={pending} className="btn-ghost text-xs text-emerald-700" onClick={() => review(true)}>Đã chuyển</button>
      <button type="button" disabled={pending} className="btn-ghost text-xs text-red-600" onClick={() => review(false)}>Từ chối</button>
    </span>
  );
}
