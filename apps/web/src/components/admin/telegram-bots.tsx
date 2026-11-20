'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/lib/client-api';
import { FormAlert } from './form-field';
import { Panel } from './ui';

// Nút tạo link kết nối Telegram (mã 1 lần, 10 phút) rồi mở Telegram
export function TelegramLinkButton({ bot, linkedName, labels }: { bot: 'shop' | 'admin'; linkedName: string | null; labels?: { connect: string; reconnect: string; disconnect: string; linked: string } }) {
  const router = useRouter();
  const l = labels ?? { connect: '🔗 Kết nối Telegram của tôi', reconnect: '🔗 Kết nối lại', disconnect: 'Ngắt kết nối', linked: 'Đã kết nối:' };
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setPending(true);
    setError(null);
    // Mở tab trước (trình duyệt chặn popup mở sau await), rồi gán link
    const win = window.open('', '_blank');
    const res = await apiRequest<{ url: string }>(`/api/telegram/link?bot=${bot}`, 'POST');
    setPending(false);
    if (!res.ok) {
      win?.close();
      return setError(res.data.error ?? 'Không tạo được link');
    }
    if (win) win.location.href = res.data.url;
    else window.location.href = res.data.url;
  }

  async function disconnect() {
    setPending(true);
    await apiRequest('/api/telegram/link', 'DELETE');
    setPending(false);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {linkedName && <p className="text-sm text-zinc-600">{l.linked} <b>{linkedName}</b></p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={pending} onClick={connect}>{linkedName ? l.reconnect : l.connect}</button>
        {linkedName && <button type="button" className="btn-ghost border border-zinc-200" disabled={pending} onClick={disconnect}>{l.disconnect}</button>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function ShopBotForm({ initial, hasToken }: { initial: { enabled: boolean; botUsername: string; supportUrl: string }; hasToken: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ enabled: initial.enabled, botToken: '', supportUrl: initial.supportUrl });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    setSuccess(null);
    const res = await apiRequest<{ botUsername: string }>('/api/admin/telegram/shop', 'PUT', f);
    setPending(false);
    if (!res.ok) return setError(res.data.error ?? 'Lưu thất bại');
    setSuccess(f.enabled ? `Đã bật bot @${res.data.botUsername}. Khách mở t.me/${res.data.botUsername} để mua hàng.` : 'Đã tắt bot khách hàng.');
    setF((s) => ({ ...s, botToken: '' }));
    router.refresh();
  }

  return (
    <Panel title="Bot khách hàng (bán hàng qua Telegram)" bodyClassName="space-y-4 p-5">
      <p className="text-sm text-zinc-500">
        Khách xem sản phẩm, mua bằng số dư và nhận tài khoản ngay trong Telegram (5 ngôn ngữ). Khách bấm &quot;Kết nối Telegram&quot; ở trang Tài khoản trên web để liên kết.
        Phải là <b>bot khác</b> với bot thông báo ở trên: tạo thêm 1 bot ở @BotFather (/newbot).
      </p>
      {initial.botUsername && (
        <p className="text-sm">
          Bot hiện tại: <a className="font-medium text-indigo-600 hover:underline" href={`https://t.me/${initial.botUsername}`} target="_blank" rel="noreferrer">@{initial.botUsername}</a>
          {initial.enabled ? <span className="ml-2 rounded bg-emerald-50 px-1.5 text-xs font-medium text-emerald-700">đang bật</span> : <span className="ml-2 rounded bg-zinc-100 px-1.5 text-xs text-zinc-500">đang tắt</span>}
        </p>
      )}
      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
        <input type="checkbox" checked={f.enabled} onChange={(e) => setF((s) => ({ ...s, enabled: e.target.checked }))} />
        Bật bot khách hàng
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Bot Token (bot khách hàng)</span>
          <input
            className="input font-mono text-xs"
            type="password"
            autoComplete="new-password"
            data-1p-ignore
            data-lpignore="true"
            value={f.botToken}
            onChange={(e) => setF((s) => ({ ...s, botToken: e.target.value.trim() }))}
            placeholder={hasToken ? 'Đã lưu, để trống = giữ nguyên' : '123456789:AAH...'}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Link hỗ trợ (tùy chọn)</span>
          <input className="input text-xs" value={f.supportUrl} onChange={(e) => setF((s) => ({ ...s, supportUrl: e.target.value.trim() }))} placeholder="https://t.me/ten_admin" />
          <span className="mt-1 block text-xs text-zinc-400">Nút &quot;Hỗ trợ&quot; trong bot mở link này. Để trống = nút mở website.</span>
        </label>
      </div>
      <FormAlert error={error} success={success} />
      <button type="button" className="btn-primary" disabled={pending} onClick={save}>{pending ? 'Đang lưu…' : 'Lưu bot khách hàng'}</button>
    </Panel>
  );
}
