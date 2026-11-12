'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/lib/client-api';

export type Field =
  | { name: string; label: string; type?: 'text' | 'number' | 'date' | 'url'; placeholder?: string; required?: boolean; step?: string; span?: 2; hint?: string; defaultValue?: string | number }
  | { name: string; label: string; type: 'textarea'; rows?: number; placeholder?: string; required?: boolean; span?: 2; hint?: string; defaultValue?: string }
  | { name: string; label: string; type: 'select'; options: { value: string; label: string }[]; span?: 2; hint?: string; defaultValue?: string }
  | { name: string; label: string; type: 'multiselect'; options: { value: string; label: string }[]; span?: 2; hint?: string; defaultValue?: string[] }
  | { name: string; label: string; type: 'checkbox'; span?: 2; hint?: string; defaultValue?: boolean };

// Form nhỏ cho Admin: gửi JSON tới API rồi làm mới trang (hoặc chuyển trang).
// Lỗi theo từng trường (fields) của API được hiện ngay dưới ô nhập.
export function QuickForm({
  url,
  method = 'POST',
  fields,
  submitLabel = 'Lưu',
  redirectTo,
  resetOnSuccess = true,
  columns = 2,
}: {
  url: string;
  method?: 'POST' | 'PATCH';
  fields: Field[];
  submitLabel?: string;
  redirectTo?: string;
  resetOnSuccess?: boolean;
  columns?: 1 | 2 | 3;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const body: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.type === 'checkbox') body[f.name] = data.get(f.name) === 'on';
      else if (f.type === 'multiselect') body[f.name] = data.getAll(f.name).map(String);
      else body[f.name] = String(data.get(f.name) ?? '').trim();
    }
    setPending(true);
    setError(null);
    setFieldErrors({});
    setDone(false);
    const res = await apiRequest<{ fields?: Record<string, string[]> }>(url, method, body);
    setPending(false);
    if (!res.ok) {
      setError(res.data.error ?? 'Lưu thất bại');
      setFieldErrors((res.data as { fields?: Record<string, string[]> }).fields ?? {});
      return;
    }
    if (redirectTo) router.push(redirectTo);
    else if (resetOnSuccess) form.reset();
    setDone(true);
    router.refresh();
  }

  const grid = columns === 3 ? 'sm:grid-cols-3' : columns === 2 ? 'sm:grid-cols-2' : '';

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className={`grid gap-4 ${grid}`}>
        {fields.map((f) => {
          const err = fieldErrors[f.name]?.[0];
          const id = `qf-${f.name}`;
          const span = f.span === 2 ? 'sm:col-span-full' : '';
          if (f.type === 'checkbox') {
            return (
              <label key={f.name} className={`flex items-center gap-2 self-end pb-2 text-sm text-zinc-700 ${span}`}>
                <input type="checkbox" name={f.name} defaultChecked={f.defaultValue ?? true} className="size-4" /> {f.label}
              </label>
            );
          }
          return (
            <div key={f.name} className={span}>
              <label htmlFor={id} className="label">{f.label}</label>
              {f.type === 'textarea' ? (
                <textarea id={id} name={f.name} rows={f.rows ?? 6} placeholder={f.placeholder} required={f.required} defaultValue={f.defaultValue} className="input" aria-invalid={!!err} />
              ) : f.type === 'select' ? (
                <select id={id} name={f.name} defaultValue={f.defaultValue} className="input">
                  {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === 'multiselect' ? (
                <select id={id} name={f.name} multiple defaultValue={f.defaultValue} className="input h-32">
                  {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input
                  id={id}
                  name={f.name}
                  type={f.type ?? 'text'}
                  step={'step' in f ? f.step : undefined}
                  placeholder={f.placeholder}
                  required={f.required}
                  defaultValue={f.defaultValue}
                  className="input"
                  aria-invalid={!!err}
                />
              )}
              {err ? <p className="mt-1 text-xs text-red-600">{err}</p> : f.hint && <p className="mt-1 text-xs text-zinc-400">{f.hint}</p>}
            </div>
          );
        })}
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-primary bg-indigo-500 hover:bg-indigo-600">{pending ? 'Đang lưu…' : submitLabel}</button>
        {done && !pending && <span className="text-sm text-emerald-600">✓ Đã lưu</span>}
      </div>
    </form>
  );
}

/** Nút gọi 1 API (xóa / bật tắt...) rồi làm mới trang */
export function ActionButton({
  url,
  method = 'DELETE',
  body,
  confirmText,
  label,
  className = 'rounded-md bg-red-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-600',
}: {
  url: string;
  method?: 'DELETE' | 'PATCH' | 'POST';
  body?: unknown;
  confirmText?: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function onClick() {
    if (confirmText && !window.confirm(confirmText)) return;
    setPending(true);
    const res = await apiRequest(url, method, body);
    setPending(false);
    if (!res.ok) return window.alert(res.data.error ?? 'Thao tác thất bại');
    router.refresh();
  }
  return (
    <button type="button" onClick={onClick} disabled={pending} className={`${className} disabled:opacity-60`}>
      {pending ? '…' : label}
    </button>
  );
}
