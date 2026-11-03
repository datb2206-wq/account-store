'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { apiRequest } from '@/lib/client-api';
import { DeleteButton } from './delete-button';
import { FormAlert, FormField } from './form-field';

export interface SupplierFormValues {
  name: string;
  adapter: string;
  baseUrl: string;
  apiKey: string;
  priceMarkup: string;
  isActive: boolean;
}

const EMPTY: SupplierFormValues = { name: '', adapter: 'accszone', baseUrl: 'https://accszone.com/api/v1', apiKey: '', priceMarkup: '1.2', isActive: true };

export function SupplierForm({ supplierId, initial }: { supplierId?: string; initial?: Omit<SupplierFormValues, 'apiKey'> }) {
  const router = useRouter();
  const isEdit = !!supplierId;
  const [values, setValues] = useState<SupplierFormValues>(initial ? { ...initial, apiKey: '' } : EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[] | undefined>>({});
  const set = <K extends keyof SupplierFormValues>(k: K, v: SupplierFormValues[K]) => setValues((s) => ({ ...s, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    setFields({});
    const res = await apiRequest<{ supplier?: { id: string } }>(
      isEdit ? `/api/admin/suppliers/${supplierId}` : '/api/admin/suppliers',
      isEdit ? 'PATCH' : 'POST',
      values,
    );
    setPending(false);
    if (!res.ok) {
      setError(res.data.error ?? 'Lưu thất bại');
      setFields(res.data.fields ?? {});
      return;
    }
    if (isEdit) {
      setSuccess('Đã lưu');
      set('apiKey', '');
      router.refresh();
    } else {
      router.push(`/admin/suppliers/${res.data.supplier!.id}`);
    }
  }

  const markup = Number(values.priceMarkup);

  return (
    <form onSubmit={onSubmit} className="card space-y-4" noValidate>
      <h2 className="font-semibold">{isEdit ? 'Thông tin nhà cung cấp' : 'Thêm nhà cung cấp'}</h2>
      <FormAlert error={error} success={success} />
      <FormField label="Tên" htmlFor="sp-name" error={fields.name}>
        <input id="sp-name" className="input" value={values.name} onChange={(e) => set('name', e.target.value)} />
      </FormField>
      <FormField label="Định dạng API" htmlFor="sp-adapter" error={fields.adapter}>
        <select id="sp-adapter" className="input" value={values.adapter} onChange={(e) => set('adapter', e.target.value)}>
          <option value="accszone">AccsZone API v1</option>
          <option value="generic">Generic (GET /products, POST /orders)</option>
        </select>
      </FormField>
      <FormField label="API base URL" htmlFor="sp-url" error={fields.baseUrl} hint={values.adapter === 'accszone' ? 'https://accszone.com/api/v1' : 'Worker gọi GET {baseUrl}/products'}>
        <input id="sp-url" className="input font-mono text-xs" placeholder="https://supplier.example.com/api" value={values.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} />
      </FormField>
      <FormField label="API key" htmlFor="sp-key" error={fields.apiKey} hint={isEdit ? 'Để trống = giữ key hiện tại. Key được lưu mã hóa.' : 'Được lưu mã hóa AES-256-GCM.'}>
        <input id="sp-key" type="password" autoComplete="off" className="input font-mono text-xs" value={values.apiKey} onChange={(e) => set('apiKey', e.target.value)} />
      </FormField>
      <FormField
        label="Hệ số giá (markup)"
        htmlFor="sp-markup"
        error={fields.priceMarkup}
        hint={markup >= 1 ? `Giá bán = giá vốn × ${markup} (lãi ${Math.round((markup - 1) * 100)}%). VD giá vốn $1.00 → bán $${markup.toFixed(2)}` : 'VD: 1.2'}
      >
        <input id="sp-markup" className="input" inputMode="decimal" value={values.priceMarkup} onChange={(e) => set('priceMarkup', e.target.value)} />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={values.isActive} onChange={(e) => set('isActive', e.target.checked)} />
        Đang hoạt động (tự đồng bộ định kỳ)
      </label>
      <div className="flex items-center justify-between">
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Đang lưu…' : isEdit ? 'Lưu' : 'Tạo'}</button>
        {isEdit && (
          <DeleteButton
            url={`/api/admin/suppliers/${supplierId}`}
            redirectTo="/admin/suppliers"
            confirmText="Xóa nhà cung cấp? Các sản phẩm đã đồng bộ sẽ bị ẨN (không xóa, đơn hàng cũ giữ nguyên)."
          />
        )}
      </div>
    </form>
  );
}

export function PublishButton({ supplierId, count }: { supplierId: string; count: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function publish() {
    if (!window.confirm(`Bật bán ${count} sản phẩm đang ẩn còn hàng? Hãy kiểm tra giá (markup) trước.`)) return;
    setPending(true);
    setMessage(null);
    const res = await apiRequest<{ published: number }>(`/api/admin/suppliers/${supplierId}/publish`, 'POST');
    setPending(false);
    setMessage(res.ok ? `Đã bật bán ${res.data.published} sản phẩm.` : (res.data.error ?? 'Không thể bật bán'));
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-2">
      <button type="button" className="btn-ghost border border-zinc-200" onClick={publish} disabled={pending || count === 0}>
        {pending ? 'Đang bật…' : `Bật bán ${count} sản phẩm còn hàng`}
      </button>
      {message && <p className="text-xs text-zinc-600">{message}</p>}
    </div>
  );
}

export function SyncButton({ supplierId, disabled }: { supplierId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setPending(true);
    setMessage(null);
    const res = await apiRequest<{ workerOnline: boolean }>(`/api/admin/suppliers/${supplierId}/sync`, 'POST');
    setPending(false);
    if (!res.ok) {
      setMessage(res.data.error ?? 'Không thể đồng bộ');
      return;
    }
    setMessage(
      res.data.workerOnline
        ? 'Đã đưa vào hàng đợi. Tải lại trang sau vài giây để xem kết quả.'
        : '⚠ Đã đưa vào hàng đợi nhưng worker KHÔNG chạy — hãy chạy pnpm dev (hoặc pnpm --filter @accszone/worker start).',
    );
    setTimeout(() => router.refresh(), 4000);
  }

  return (
    <div className="space-y-2">
      <button type="button" className="btn-primary" onClick={sync} disabled={pending || disabled}>
        {pending ? 'Đang gửi…' : '⟳ Đồng bộ ngay'}
      </button>
      {message && <p className="text-xs text-zinc-600">{message}</p>}
    </div>
  );
}
