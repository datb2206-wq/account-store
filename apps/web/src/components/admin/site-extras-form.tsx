'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ContentPage } from '@accszone/core'; // chỉ kiểu
import { apiRequest } from '@/lib/client-api';
import type { SiteExtras } from '@/lib/site-extras'; // chỉ kiểu
import { FormAlert } from './form-field';
import { Panel } from './ui';

const PAGE_TABS: [ContentPage, string][] = [
  ['policy', 'Chính sách bảo hành'],
  ['terms', 'Điều khoản sử dụng'],
  ['faq', 'Câu hỏi thường gặp'],
  ['contact', 'Liên hệ'],
];

const FORMAT_HELP = 'Định dạng: dòng trống = đoạn mới, "## " đầu dòng = tiêu đề, "- " = gạch đầu dòng, link https:// tự thành liên kết.';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-zinc-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-400">{hint}</span>}
    </label>
  );
}

function ColorField({ label, hint, value, fallback, onChange }: { label: string; hint: string; value: string; fallback: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <input type="color" value={value || fallback} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-zinc-300" />
        <input className="input w-32 font-mono" value={value} placeholder={fallback} onChange={(e) => onChange(e.target.value.trim())} />
        {value && <button type="button" className="btn-ghost text-xs" onClick={() => onChange('')}>Mặc định</button>}
      </div>
    </Field>
  );
}

export function SiteExtrasForm({ initial, siteUrl }: { initial: SiteExtras; siteUrl: string }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [tab, setTab] = useState<ContentPage>('policy');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const set = <K extends keyof SiteExtras>(key: K, patch: Partial<SiteExtras[K]>) =>
    setF((s) => ({ ...s, [key]: typeof s[key] === 'object' ? { ...(s[key] as object), ...patch } : patch }));
  const setPage = (slug: ContentPage, patch: Partial<SiteExtras['pages'][ContentPage]>) =>
    setF((s) => ({ ...s, pages: { ...s.pages, [slug]: { ...s.pages[slug], ...patch } } }));

  async function save() {
    setPending(true);
    setError(null);
    setSuccess(null);
    const res = await apiRequest('/api/admin/site-extras', 'PUT', f);
    setPending(false);
    if (!res.ok) return setError(res.data.error ?? 'Lưu thất bại');
    setSuccess('Đã lưu. Trang khách cập nhật ngay.');
    router.refresh();
  }

  const saveBar = (
    <div className="sticky bottom-0 z-10 -mx-1 flex items-center gap-3 rounded-xl bg-white/90 p-3 shadow-[0_-1px_6px_rgba(16,24,40,0.08)] backdrop-blur">
      <button type="button" className="btn-primary" disabled={pending} onClick={save}>{pending ? 'Đang lưu…' : 'Lưu tất cả'}</button>
      <div className="min-w-0 flex-1"><FormAlert error={error} success={success} /></div>
    </div>
  );

  return (
    <div className="space-y-5">
      <Panel title="Màu sắc">
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField label="Màu chủ đạo" hint="Nút, liên kết, điểm nhấn trên trang khách." value={f.primaryColor} fallback="#2563eb" onChange={(v) => setF((s) => ({ ...s, primaryColor: v }))} />
          <ColorField label="Màu nút Mua" hint="Nút mua hàng, nhãn HOT, nút Xem tất cả." value={f.buyColor} fallback="#ea580c" onChange={(v) => setF((s) => ({ ...s, buyColor: v }))} />
        </div>
      </Panel>

      <Panel title="Popup thông báo trang chủ">
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <input type="checkbox" checked={f.popup.enabled} onChange={(e) => set('popup', { enabled: e.target.checked })} />
            Hiện popup khi khách vào web
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tiêu đề"><input className="input" value={f.popup.title} onChange={(e) => set('popup', { title: e.target.value })} /></Field>
            <Field label="Tần suất">
              <select className="input" value={f.popup.frequency} onChange={(e) => set('popup', { frequency: e.target.value as SiteExtras['popup']['frequency'] })}>
                <option value="session">1 lần mỗi lượt truy cập</option>
                <option value="day">1 lần mỗi ngày</option>
                <option value="always">Mỗi lần tải trang</option>
              </select>
            </Field>
          </div>
          <Field label="Nội dung" hint={`${FORMAT_HELP} Sửa nội dung thì khách đã tắt popup cũ sẽ thấy lại.`}>
            <textarea className="input min-h-32" value={f.popup.body} onChange={(e) => set('popup', { body: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Chữ trên nút (tùy chọn)"><input className="input" value={f.popup.buttonText} placeholder="VD: Nạp tiền ngay" onChange={(e) => set('popup', { buttonText: e.target.value })} /></Field>
            <Field label="Link của nút" hint='VD "/dashboard/deposit" hoặc https://t.me/...'><input className="input" value={f.popup.buttonUrl} onChange={(e) => set('popup', { buttonUrl: e.target.value })} /></Field>
          </div>
        </div>
      </Panel>

      <Panel title="Trang nội dung">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1 border-b border-zinc-100">
            {PAGE_TABS.map(([slug, label]) => (
              <button
                key={slug}
                type="button"
                onClick={() => setTab(slug)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === slug ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-zinc-500 hover:text-zinc-800'}`}
              >
                {label}{f.pages[slug].body.trim() ? ' ✓' : ''}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500">
            Đường dẫn: <code className="font-mono">{siteUrl}/pages/{tab}</code>. Trang có nội dung sẽ tự hiện link ở chân trang; để trống = ẩn trang.
          </p>
          <Field label="Tiêu đề trang"><input className="input" value={f.pages[tab].title} placeholder={PAGE_TABS.find(([s]) => s === tab)![1]} onChange={(e) => setPage(tab, { title: e.target.value })} /></Field>
          <Field label="Nội dung" hint={FORMAT_HELP}>
            <textarea className="input min-h-64 font-mono text-[13px]" value={f.pages[tab].body} onChange={(e) => setPage(tab, { body: e.target.value })} />
          </Field>
        </div>
      </Panel>

      <Panel title="Nút liên hệ nổi (góc trái màn hình)">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Số Zalo" hint="VD 0912345678. Để trống = ẩn."><input className="input" inputMode="numeric" value={f.widgets.zalo} onChange={(e) => set('widgets', { zalo: e.target.value.replace(/\s/g, '') })} /></Field>
          <Field label="Facebook Messenger" hint="Username trang, VD myshop (facebook.com/myshop)."><input className="input" value={f.widgets.messenger} onChange={(e) => set('widgets', { messenger: e.target.value.trim() })} /></Field>
          <Field label="Hotline" hint="Bấm để gọi trên điện thoại."><input className="input" inputMode="tel" value={f.widgets.hotline} onChange={(e) => set('widgets', { hotline: e.target.value.replace(/[\s.-]/g, '') })} /></Field>
        </div>
      </Panel>

      <Panel title="Sắp xếp sản phẩm trang chủ">
        <div className="grid items-end gap-4 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <input type="checkbox" checked={f.catalog.soldOutLast} onChange={(e) => set('catalog', { soldOutLast: e.target.checked })} />
            Đẩy sản phẩm hết hàng xuống cuối danh mục
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <input type="checkbox" checked={f.catalog.featuredRow} onChange={(e) => set('catalog', { featuredRow: e.target.checked })} />
            Hiện hàng &quot;📌 Nổi bật&quot; ở đầu trang chủ
          </label>
          <Field label="Số sản phẩm nổi bật tối đa">
            <input className="input tabular-nums" inputMode="numeric" value={f.catalog.featuredLimit} onChange={(e) => set('catalog', { featuredLimit: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
          </Field>
        </div>
        <p className="mt-3 text-xs text-zinc-400">Ghim sản phẩm bằng nút 📌 ở trang Sản phẩm. Sản phẩm ghim luôn đứng đầu danh mục của nó; sau đó theo số &quot;Thứ tự&quot; (nhỏ trước).</p>
      </Panel>

      <Panel title="Bảng xếp hạng người mua (trang chủ)">
        <div className="grid items-end gap-4 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <input type="checkbox" checked={f.leaderboard.enabled} onChange={(e) => set('leaderboard', { enabled: e.target.checked })} />
            Hiện bảng xếp hạng
          </label>
          <Field label="Tính theo">
            <select className="input" value={f.leaderboard.period} onChange={(e) => set('leaderboard', { period: e.target.value as SiteExtras['leaderboard']['period'] })}>
              <option value="week">7 ngày qua</option>
              <option value="month">Tháng này</option>
              <option value="all">Từ trước đến nay</option>
            </select>
          </Field>
          <Field label="Số người">
            <input className="input tabular-nums" inputMode="numeric" value={f.leaderboard.size} onChange={(e) => set('leaderboard', { size: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
          </Field>
        </div>
        <p className="mt-3 text-xs text-zinc-400">Chỉ dùng đơn hàng thật đã hoàn tất. Email khách được che (VD da*****@gmail.com). Cập nhật mỗi 5 phút.</p>
      </Panel>

      <Panel title="Mã theo dõi & HTML tùy chỉnh">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Google Analytics 4" hint="Measurement ID dạng G-XXXXXXXXXX."><input className="input font-mono" value={f.tracking.gaId} onChange={(e) => set('tracking', { gaId: e.target.value.trim() })} /></Field>
            <Field label="Facebook Pixel ID"><input className="input font-mono" inputMode="numeric" value={f.tracking.fbPixelId} onChange={(e) => set('tracking', { fbPixelId: e.target.value.trim() })} /></Field>
          </div>
          <Field label="HTML chèn cuối trang" hint="VD mã chat Tawk.to / Crisp. Chỉ áp dụng trang khách, không chạy trong Admin. Chỉ dán mã từ nguồn bạn tin tưởng: mã này chạy trên trình duyệt của mọi khách.">
            <textarea className="input min-h-28 font-mono text-[13px]" value={f.tracking.bodyHtml} onChange={(e) => set('tracking', { bodyHtml: e.target.value })} />
          </Field>
        </div>
      </Panel>

      {saveBar}
    </div>
  );
}
