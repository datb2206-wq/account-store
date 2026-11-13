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
  autoUpdatePrice: boolean;
  priceRounding: string;
  autoUpdateInfo: boolean;
  stripHtml: boolean;
  isActive: boolean;
}

const DEFAULT_URL: Record<string, string> = { accszone: 'https://accszone.com/api/v1', generic: '' };

const EMPTY: SupplierFormValues = {
  name: '',
  adapter: 'accszone',
  baseUrl: DEFAULT_URL.accszone!,
  apiKey: '',
  priceMarkup: '1.2',
  autoUpdatePrice: true,
  priceRounding: 'none',
  autoUpdateInfo: false,
  stripHtml: true,
  isActive: true,
};

const ROUNDING_OPTIONS = [
  { value: 'none', label: 'OFF - Giữ nguyên số' },
  { value: '0.01', label: 'Làm tròn lên $0.01' },
  { value: '0.1', label: 'Làm tròn lên $0.1' },
  { value: '1', label: 'Làm tròn lên $1' },
];

// Markup lưu dạng hệ số (1.2); form nhập dạng % tăng giá (20)
const markupToPercent = (m: string) => String(Math.round((Number(m) - 1) * 10000) / 100);
const percentToMarkup = (p: string) => {
  const n = Number(p.replace(',', '.'));
  return p.trim() === '' || !Number.isFinite(n) ? p : String(Math.round((1 + n / 100) * 10000) / 10000);
};

function previewPrice(cost: number, markup: number, rounding: string) {
  const raw = cost * markup;
  const step = rounding === 'none' ? 0.0001 : Number(rounding);
  return Math.ceil(raw / step - 1e-9) * step;
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 border-l-4 border-l-indigo-500 bg-zinc-50/60 p-5 shadow-sm">
      <h3 className="flex items-center gap-2 text-base font-semibold text-zinc-800"><span aria-hidden>{icon}</span>{title}</h3>
      {children}
    </section>
  );
}

function OnOff({ id, value, onChange, on, off }: { id: string; value: boolean; onChange: (v: boolean) => void; on: string; off: string }) {
  return (
    <select id={id} className="input" value={value ? '1' : '0'} onChange={(e) => onChange(e.target.value === '1')}>
      <option value="1">ON - {on}</option>
      <option value="0">OFF - {off}</option>
    </select>
  );
}

export function SupplierForm({ supplierId, initial }: { supplierId?: string; initial?: Omit<SupplierFormValues, 'apiKey'> }) {
  const router = useRouter();
  const isEdit = !!supplierId;
  const start = initial ? { ...initial, apiKey: '' } : EMPTY;
  const [values, setValues] = useState<SupplierFormValues>(start);
  const [percent, setPercent] = useState(markupToPercent(start.priceMarkup));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[] | undefined>>({});
  const set = <K extends keyof SupplierFormValues>(k: K, v: SupplierFormValues[K]) => setValues((s) => ({ ...s, [k]: v }));

  function changeAdapter(adapter: string) {
    // Đổi loại API: tự điền domain mặc định nếu ô đang để trống hoặc đang là domain mặc định của loại cũ
    setValues((s) => ({ ...s, adapter, baseUrl: !s.baseUrl || s.baseUrl === DEFAULT_URL[s.adapter] ? (DEFAULT_URL[adapter] ?? '') : s.baseUrl }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    setFields({});
    const res = await apiRequest<{ supplier?: { id: string } }>(
      isEdit ? `/api/admin/suppliers/${supplierId}` : '/api/admin/suppliers',
      isEdit ? 'PATCH' : 'POST',
      { ...values, name: values.name.trim() || hostOf(values.baseUrl), priceMarkup: percentToMarkup(percent) },
    );
    setPending(false);
    if (!res.ok) {
      setError(res.data.error ?? 'Lưu thất bại');
      setFields(res.data.fields ?? {});
      return;
    }
    if (isEdit) {
      setSuccess('Đã lưu. Thay đổi áp dụng từ lần đồng bộ tiếp theo.');
      set('apiKey', '');
      router.refresh();
    } else {
      router.push(`/admin/suppliers/${res.data.supplier!.id}`);
    }
  }

  const pct = Number(percent.replace(',', '.'));
  const example = Number.isFinite(pct) && pct >= 0 ? previewPrice(0.44, 1 + pct / 100, values.priceRounding) : null;

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormAlert error={error} success={success} />

      <Section icon="🔌" title="Thông tin kết nối API">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Loại API *" htmlFor="sp-adapter" error={fields.adapter} hint="AccsZone dùng API v1 chính thức; loại khác dùng chuẩn chung GET /products, POST /orders.">
            <select id="sp-adapter" className="input" value={values.adapter} onChange={(e) => changeAdapter(e.target.value)}>
              <option value="accszone">AccsZone API v1</option>
              <option value="generic">API khác (chuẩn chung)</option>
            </select>
          </FormField>
          <FormField label="Domain / API URL *" htmlFor="sp-url" error={fields.baseUrl} hint="Nhập đầy đủ URL kèm https://">
            <input id="sp-url" className="input font-mono text-xs" placeholder="VD: https://domain.com/api" value={values.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} />
          </FormField>
          <FormField label={isEdit ? 'API key' : 'API key *'} htmlFor="sp-key" error={fields.apiKey} hint={isEdit ? 'Để trống = giữ key hiện tại. Key được lưu mã hóa.' : 'Lấy ở trang API của web nguồn. Key được lưu mã hóa.'}>
            <input id="sp-key" type="password" autoComplete="off" className="input font-mono text-xs" value={values.apiKey} onChange={(e) => set('apiKey', e.target.value)} />
          </FormField>
          <FormField label="Tên gợi nhớ" htmlFor="sp-name" error={fields.name} hint="Để trống = dùng tên miền">
            <input id="sp-name" className="input" placeholder="VD: AccsZone" value={values.name} onChange={(e) => set('name', e.target.value)} />
          </FormField>
        </div>
      </Section>

      <Section icon="⚙️" title="Cài đặt đồng bộ dữ liệu">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Cập nhật giá bán tự động *" htmlFor="sp-autoprice" hint="Khi giá gốc thay đổi, hệ thống tự tính lại giá bán. Tắt = giữ giá bạn tự đặt (vẫn tự nâng nếu giá gốc vượt giá bán).">
            <OnOff id="sp-autoprice" value={values.autoUpdatePrice} onChange={(v) => set('autoUpdatePrice', v)} on="Cập nhật tự động" off="Giữ giá đã đặt" />
          </FormField>
          <FormField label="Làm tròn giá bán *" htmlFor="sp-round" error={fields.priceRounding} hint={example !== null ? `VD: giá gốc $0.44 → bán $${example.toFixed(values.priceRounding === 'none' ? 4 : 2).replace(/0+$/, '').replace(/\.$/, '')}` : undefined}>
            <select id="sp-round" className="input" value={values.priceRounding} onChange={(e) => set('priceRounding', e.target.value)}>
              {ROUNDING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FormField>
          <FormField label="Tăng giá so với giá gốc *" htmlFor="sp-pct" error={fields.priceMarkup} hint="Nhập 10 để tăng giá bán thêm 10% so với giá gốc, nhập 0 để giữ nguyên.">
            <div className="flex">
              <input id="sp-pct" className="input rounded-r-none" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} />
              <span className="flex items-center rounded-r-lg border border-l-0 border-zinc-300 bg-zinc-100 px-3 text-sm text-zinc-500">%</span>
            </div>
          </FormField>
          <FormField label="Cập nhật tên & mô tả tự động *" htmlFor="sp-autoinfo" hint="Bật = tên & mô tả tiếng Anh luôn theo web nguồn (ghi đè chỗ bạn đã sửa).">
            <OnOff id="sp-autoinfo" value={values.autoUpdateInfo} onChange={(v) => set('autoUpdateInfo', v)} on="Cập nhật tự động" off="Giữ nội dung đã sửa" />
          </FormField>
          <FormField label="Lọc HTML trong nội dung API *" htmlFor="sp-html" hint="Bảo vệ website bằng cách lọc mã HTML khỏi tên & mô tả lấy từ API.">
            <OnOff id="sp-html" value={values.stripHtml} onChange={(v) => set('stripHtml', v)} on="Kích hoạt bảo vệ" off="Giữ nguyên" />
          </FormField>
        </div>
      </Section>

      <Section icon="🧩" title="Cài đặt khác">
        <FormField label="Trạng thái kết nối" htmlFor="sp-active" hint="Tắt = ngừng đồng bộ định kỳ với web nguồn.">
          <OnOff id="sp-active" value={values.isActive} onChange={(v) => set('isActive', v)} on="Đang hoạt động" off="Tạm dừng" />
        </FormField>
      </Section>

      <button type="submit" className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-60" disabled={pending}>
        {pending ? 'Đang lưu…' : isEdit ? 'Lưu cài đặt' : '🔗 Kết nối API ngay'}
      </button>
      {isEdit && (
        <div className="flex justify-end">
          <DeleteButton
            url={`/api/admin/suppliers/${supplierId}`}
            redirectTo="/admin/suppliers"
            confirmText="Xóa kết nối API này? Các sản phẩm đã đồng bộ sẽ bị ẨN (không xóa, đơn hàng cũ giữ nguyên)."
          />
        </div>
      )}
    </form>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
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
