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
  syncCategories: boolean;
  autoActivate: boolean;
  priceRate: string; // '' = tự động
  proxy: string; // chỉ gửi lên, không bao giờ trả về trình duyệt
  clearProxy: boolean;
  isActive: boolean;
}

const DEFAULT_URL: Record<string, string> = { accszone: 'https://accszone.com/api/v1', via79: 'https://via79.com/api', buyaccfb: 'https://graph.buyaccfb.com/api', generic: '' };

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
  syncCategories: true,
  autoActivate: false,
  priceRate: '',
  proxy: '',
  clearProxy: false,
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

export function SupplierForm({ supplierId, initial, hasProxy = false }: { supplierId?: string; initial?: Omit<SupplierFormValues, 'apiKey' | 'proxy' | 'clearProxy'>; hasProxy?: boolean }) {
  const router = useRouter();
  const isEdit = !!supplierId;
  const start = initial ? { ...initial, apiKey: '', proxy: '', clearProxy: false } : EMPTY;
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
      setValues((s) => ({ ...s, apiKey: '', proxy: '', clearProxy: false }));
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
          <FormField label="Loại API *" htmlFor="sp-adapter" error={fields.adapter} hint="AccsZone dùng API v1 chính thức; SHOPCLONE7 / CMSNT (Via79, CloneMMO247 và các web cùng mã nguồn) chỉ cần nhập tên miền, giá VND tự quy đổi USD theo tỷ giá VND ở Cấu hình; loại khác dùng chuẩn chung GET /products, POST /orders.">
            <select id="sp-adapter" className="input" value={values.adapter} onChange={(e) => changeAdapter(e.target.value)}>
              <option value="accszone">AccsZone API v1</option>
              <option value="via79">SHOPCLONE7 / CMSNT: Via79, CloneMMO247… (giá VND)</option>
              <option value="buyaccfb">BuyAccFB (giá VND)</option>
              <option value="generic">API khác (chuẩn chung)</option>
            </select>
          </FormField>
          <FormField label="Domain / API URL *" htmlFor="sp-url" error={fields.baseUrl} hint={values.adapter === 'via79' ? 'Nhập tên miền web nguồn kèm https://, VD: https://via79.com/' : 'Nhập đầy đủ URL kèm https://'}>
            <input id="sp-url" className="input font-mono text-xs" placeholder="VD: https://domain.com/api" value={values.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} />
          </FormField>
          <FormField label={isEdit ? 'API key' : 'API key *'} htmlFor="sp-key" error={fields.apiKey} hint={isEdit ? 'Để trống = giữ key hiện tại. Key được lưu mã hóa.' : 'Lấy ở trang API của web nguồn. Key được lưu mã hóa.'}>
            <input id="sp-key" name="supplier-api-key" type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" className="input font-mono text-xs" value={values.apiKey} onChange={(e) => set('apiKey', e.target.value)} />
          </FormField>
          <FormField label="Tên gợi nhớ" htmlFor="sp-name" error={fields.name} hint="Để trống = dùng tên miền">
            <input id="sp-name" className="input" placeholder="VD: AccsZone" value={values.name} onChange={(e) => set('name', e.target.value)} />
          </FormField>
        </div>
      </Section>

      <Section icon="⚙️" title="Cài đặt đồng bộ dữ liệu">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Đồng bộ chuyên mục từ API *" htmlFor="sp-cats" hint="Bật = tự tạo danh mục theo web nguồn. Tắt = sản phẩm mới về chung 1 danh mục mang tên kết nối.">
            <OnOff id="sp-cats" value={values.syncCategories} onChange={(v) => set('syncCategories', v)} on="Đồng bộ chuyên mục" off="Không đồng bộ" />
          </FormField>
          <FormField label="Tự động bật bán sản phẩm *" htmlFor="sp-activate" hint="Bật = sản phẩm mới (còn hàng) được bật bán ngay sau khi đồng bộ. Tắt = để ẩn, bạn kiểm tra giá rồi bật.">
            <OnOff id="sp-activate" value={values.autoActivate} onChange={(v) => set('autoActivate', v)} on="Bật bán ngay" off="Giữ ẩn khi đồng bộ" />
          </FormField>
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
          <FormField
            label="Tỷ giá tiền tệ của API (nếu có)"
            htmlFor="sp-rate"
            error={fields.priceRate}
            hint={
              values.adapter === 'via79' || values.adapter === 'buyaccfb'
                ? 'Để trống = tự dùng tỷ giá VND ở Cấu hình. Nhập để đặt riêng: 1 VND = ? USD, VD 0.000038.'
                : 'Để trống = giá API đã là USD. Nếu API tính bằng tiền khác, nhập 1 đơn vị tiền đó = ? USD, VD API giá VND thì nhập 0.000038.'
            }
          >
            <div className="flex">
              <input id="sp-rate" className="input rounded-r-none font-mono" inputMode="decimal" placeholder="Tự động" value={values.priceRate} onChange={(e) => set('priceRate', e.target.value)} />
              <span className="flex items-center rounded-r-lg border border-l-0 border-zinc-300 bg-zinc-100 px-3 text-sm text-zinc-500">USD</span>
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
        <FormField
          label="Proxy v4 hoặc v6 (nếu có)"
          htmlFor="sp-proxy"
          error={fields.proxy}
          hint={`Chỉ dùng khi web nguồn bắt whitelist IP mà vẫn không kết nối được. Proxy HTTP dạng ip:port hoặc ip:port:username:password (IPv6 để trong [ ]). Được lưu mã hóa.${hasProxy ? ' Đang có proxy: để trống = giữ nguyên.' : ''}`}
        >
          <input
            id="sp-proxy"
            name="supplier-proxy"
            type="password"
            autoComplete="new-password"
            data-1p-ignore
            data-lpignore="true"
            className="input font-mono text-xs"
            placeholder={hasProxy && !values.clearProxy ? '•••••••• (đang dùng proxy)' : 'ip:port:username:password'}
            value={values.proxy}
            disabled={values.clearProxy}
            onChange={(e) => set('proxy', e.target.value)}
          />
          {hasProxy && (
            <label className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
              <input type="checkbox" checked={values.clearProxy} onChange={(e) => setValues((s) => ({ ...s, clearProxy: e.target.checked, proxy: '' }))} />
              Bỏ proxy (kết nối trực tiếp)
            </label>
          )}
        </FormField>
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
