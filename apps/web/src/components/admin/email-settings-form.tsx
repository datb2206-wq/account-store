'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { EmailSettings, EmailTemplateKey } from '@accszone/core'; // chỉ kiểu, không kéo code server vào trình duyệt
import { apiRequest } from '@/lib/client-api';
import { FormAlert } from './form-field';
import { Panel } from './ui';

const TEMPLATE_LABELS: Record<EmailTemplateKey, string> = {
  order: 'Email xác nhận đơn hàng (gửi khách sau khi mua)',
  loginAlert: 'Email cảnh báo đăng nhập (gửi khách mỗi lần đăng nhập)',
};

const PRESETS = [
  { label: 'Gmail', host: 'smtp.gmail.com', port: 587, secure: 'tls' as const },
  { label: 'Brevo', host: 'smtp-relay.brevo.com', port: 587, secure: 'tls' as const },
  { label: 'Zoho', host: 'smtp.zoho.com', port: 465, secure: 'ssl' as const },
];

export function EmailSettingsForm({
  initial,
  hasPass,
  variables,
  defaults,
}: {
  initial: EmailSettings;
  hasPass: boolean;
  variables: Record<EmailTemplateKey, [string, string][]>;
  defaults: EmailSettings['templates'];
}) {
  const router = useRouter();
  const [f, setF] = useState<EmailSettings>({ ...initial, pass: '' });
  const [testTo, setTestTo] = useState('');
  const [pending, setPending] = useState<'save' | 'test' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const set = (patch: Partial<EmailSettings>) => setF((s) => ({ ...s, ...patch }));
  const setTpl = (key: EmailTemplateKey, patch: Partial<EmailSettings['templates'][EmailTemplateKey]>) =>
    setF((s) => ({ ...s, templates: { ...s.templates, [key]: { ...s.templates[key], ...patch } } }));

  async function save() {
    setPending('save');
    setError(null);
    setSuccess(null);
    const res = await apiRequest('/api/admin/email', 'PUT', f);
    setPending(null);
    if (!res.ok) return setError(res.data.error ?? 'Lưu thất bại');
    setSuccess('Đã lưu. Áp dụng trong vòng 1 phút.');
    set({ pass: '' });
    router.refresh();
  }

  async function test() {
    setPending('test');
    setError(null);
    setSuccess(null);
    const res = await apiRequest('/api/admin/email/test', 'POST', { ...f, to: testTo });
    setPending(null);
    if (!res.ok) return setError(Object.values(res.data.fields ?? {}).flat()[0] ?? res.data.error ?? 'Gửi thử thất bại');
    setSuccess(`Đã gửi email thử tới ${testTo}. Kiểm tra cả hộp thư Spam.`);
  }

  return (
    <div className="space-y-5">
      <FormAlert error={error} success={success} />

      <Panel title="Cấu hình SMTP" bodyClassName="space-y-4 p-5">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <input type="checkbox" checked={f.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          Bật gửi email
        </label>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          Điền nhanh:
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="rounded-md border border-zinc-300 px-2 py-1 hover:bg-zinc-50" onClick={() => set({ host: p.host, port: p.port, secure: p.secure })}>{p.label}</button>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block text-sm md:col-span-1">
            <span className="mb-1 block font-medium text-zinc-700">SMTP Host</span>
            <input className="input" value={f.host} onChange={(e) => set({ host: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Mã hóa</span>
            <select className="input" value={f.secure} onChange={(e) => set({ secure: e.target.value as EmailSettings['secure'] })}>
              <option value="tls">TLS (STARTTLS)</option>
              <option value="ssl">SSL</option>
              <option value="none">Không mã hóa</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Cổng</span>
            <input className="input tabular-nums" inputMode="numeric" value={f.port} onChange={(e) => set({ port: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Email SMTP (tài khoản đăng nhập)</span>
            <input className="input" value={f.user} onChange={(e) => set({ user: e.target.value })} placeholder="yourmail@gmail.com" autoComplete="off" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Mật khẩu SMTP</span>
            <input
              className="input"
              type="password"
              name="smtp-password"
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              value={f.pass}
              onChange={(e) => set({ pass: e.target.value })}
              placeholder={hasPass ? 'Đã lưu, để trống = giữ nguyên' : 'Gmail: dùng "Mật khẩu ứng dụng"'}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Email gửi đi (From)</span>
            <input className="input" value={f.fromEmail} onChange={(e) => set({ fromEmail: e.target.value })} placeholder="Để trống = dùng Email SMTP" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Tên người gửi</span>
            <input className="input" value={f.fromName} onChange={(e) => set({ fromName: e.target.value })} placeholder="VD: Tên shop của bạn" />
          </label>
        </div>
        <p className="text-xs text-zinc-500">
          Gmail: bật xác minh 2 bước rồi tạo <b>Mật khẩu ứng dụng</b> tại myaccount.google.com/apppasswords (không dùng mật khẩu Gmail thường). Gmail cá nhân gửi được khoảng 500 email/ngày.
        </p>
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
          <input className="input w-72" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Email nhận thử" />
          <button type="button" className="btn-ghost border border-zinc-200" disabled={!!pending} onClick={test}>{pending === 'test' ? 'Đang gửi…' : '✉ Gửi email thử'}</button>
        </div>
      </Panel>

      <Panel title="Mẫu email gửi khách" bodyClassName="divide-y divide-zinc-100">
        {(Object.keys(TEMPLATE_LABELS) as EmailTemplateKey[]).map((key) => (
          <div key={key} className="grid gap-3 p-5 lg:grid-cols-[1fr_240px]">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                  <input type="checkbox" checked={f.templates[key].enabled} onChange={(e) => setTpl(key, { enabled: e.target.checked })} />
                  {TEMPLATE_LABELS[key]}
                </label>
                <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => setTpl(key, defaults[key])}>Dùng mẫu mặc định</button>
              </div>
              <input className="input" value={f.templates[key].subject} onChange={(e) => setTpl(key, { subject: e.target.value })} placeholder="Tiêu đề" aria-label="Tiêu đề" />
              <textarea className="input min-h-40 font-mono text-xs" value={f.templates[key].body} onChange={(e) => setTpl(key, { body: e.target.value })} aria-label="Nội dung HTML" />
            </div>
            <ul className="space-y-0.5 text-xs text-zinc-500">
              {variables[key].map(([k, label]) => (
                <li key={k}><code className="text-violet-700">{`{${k}}`}</code> {label}</li>
              ))}
              <li className="pt-1 text-zinc-400">Nội dung viết bằng HTML (VD &lt;b&gt;, &lt;p&gt;, &lt;a href&gt;). Email không chứa nội dung tài khoản, chỉ link xem đơn.</li>
            </ul>
          </div>
        ))}
      </Panel>

      <button type="button" className="btn-primary" disabled={!!pending} onClick={save}>{pending === 'save' ? 'Đang lưu…' : 'Lưu cấu hình email'}</button>
    </div>
  );
}
