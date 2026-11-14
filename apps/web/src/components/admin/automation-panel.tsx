'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/lib/client-api';
import { humanizeSeconds } from '@/lib/duration';
import { FormAlert } from './form-field';

const PRESETS: [string, number][] = [['1 ngày', 86400], ['3 ngày', 3 * 86400], ['7 ngày', 7 * 86400], ['30 ngày', 30 * 86400], ['3 tháng', 90 * 86400]];

// Form "Thêm task": tên, loại công việc, xóa dữ liệu cũ hơn N giây (nút nhanh 1 ngày ... 3 tháng)
export function AutomationForm({ types }: { types: { value: string; label: string; hint: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [seconds, setSeconds] = useState('604800');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hint = types.find((t) => t.value === type)?.hint;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await apiRequest('/api/admin/automations', 'POST', { name, type, olderThanSec: seconds, isActive: true });
    setPending(false);
    if (!res.ok) {
      const first = Object.values(res.data.fields ?? {}).flat()[0];
      setError(first ?? res.data.error ?? 'Lưu thất bại');
      return;
    }
    setName('');
    setType('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormAlert error={error} />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Tên công việc</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Xóa tài khoản đã bán sau 7 ngày" maxLength={100} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Loại công việc *</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">-- Chọn loại công việc --</option>
            {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
      </div>
      {hint && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{hint}</p>}
      <div className="text-sm">
        <span className="mb-1 block font-medium text-zinc-700">Xóa dữ liệu cũ hơn *</span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex">
            <input className="input w-40 rounded-r-none tabular-nums" inputMode="numeric" value={seconds} onChange={(e) => setSeconds(e.target.value.replace(/\D/g, ''))} aria-label="Số giây" />
            <span className="grid place-items-center rounded-r-lg border border-l-0 border-zinc-300 bg-zinc-50 px-3 text-zinc-500">giây</span>
          </div>
          {PRESETS.map(([label, s]) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeconds(String(s))}
              className={`rounded-md border px-2.5 py-1.5 text-xs ${seconds === String(s) ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-zinc-300 text-zinc-600 hover:bg-zinc-50'}`}
            >
              {label}
            </button>
          ))}
          {Number(seconds) > 0 && <span className="text-xs text-zinc-500">= {humanizeSeconds(Number(seconds))}</span>}
        </div>
      </div>
      <button type="submit" className="btn-primary" disabled={pending || !type}>{pending ? 'Đang lưu…' : '+ Thêm task'}</button>
    </form>
  );
}

// Nút trên từng dòng: chạy ngay, bật/tắt, xóa
export function AutomationActions({ id, name, isActive }: { id: string; name: string; isActive: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function call(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setPending(true);
    const res = await apiRequest<{ result?: string }>(url, method, body);
    setPending(false);
    if (!res.ok) window.alert(res.data.error ?? 'Thao tác thất bại');
    else if (res.data.result) window.alert(res.data.result);
    router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap justify-end gap-1">
      <button type="button" disabled={pending} className="btn-ghost text-xs text-indigo-600" onClick={() => call(`/api/admin/automations/${id}/run`, 'POST', undefined, `Chạy ngay "${name}"? Dữ liệu cũ sẽ bị xóa vĩnh viễn.`)}>
        Chạy ngay
      </button>
      <button type="button" disabled={pending} className="btn-ghost text-xs" onClick={() => call(`/api/admin/automations/${id}`, 'PATCH', { isActive: !isActive })}>
        {isActive ? 'Tắt' : 'Bật'}
      </button>
      <button type="button" disabled={pending} className="btn-ghost text-xs text-red-600" onClick={() => call(`/api/admin/automations/${id}`, 'DELETE', undefined, `Xóa công việc "${name}"?`)}>
        Xóa
      </button>
    </span>
  );
}
