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
        Khách bấm Start là có tài khoản ngay (tên đăng nhập tg_&lt;ID Telegram&gt;), xem / tìm sản phẩm, nạp tiền PIX / USDT, mua bằng số dư và nhận tài khoản ngay trong Telegram. Khách đã có tài khoản web thì bấm &quot;Kết nối Telegram&quot; ở trang Tài khoản để liên kết.
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

type BroadcastStatus = { id: string; text: string; state: string; createdAt: number; total: number; sent: number; failed: number; done: boolean } | null;

// Gửi thông báo hàng loạt tới mọi khách đã bấm Start bot bán hàng (worker gửi ~20 tin/giây)
export function ShopBroadcast({ recipients, initialLast }: { recipients: number; initialLast: BroadcastStatus }) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [last, setLast] = useState<BroadcastStatus>(initialLast);

  async function refresh() {
    const data = (await fetch('/api/admin/telegram/shop/broadcast', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)) as { last: BroadcastStatus } | null;
    if (data) setLast(data.last);
    return data?.last ?? null;
  }

  async function send(test: boolean) {
    if (!test && !window.confirm(`Gửi thông báo này tới ${recipients.toLocaleString('en-US')} khách?`)) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    const res = await apiRequest<{ recipients?: number }>('/api/admin/telegram/shop/broadcast', 'POST', { text, test });
    setPending(false);
    if (!res.ok) return setError(res.data.error ?? 'Gửi thất bại');
    if (test) return setSuccess('Đã gửi thử vào Telegram của bạn.');
    setSuccess(`Đang gửi tới ${res.data.recipients?.toLocaleString('en-US')} khách…`);
    // Theo dõi tiến độ tới khi xong
    for (let i = 0; i < 600; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const s = await refresh();
      if (!s || s.done || s.state === 'failed' || s.state === 'completed') break;
    }
  }

  const running = last && !last.done && last.state !== 'failed' && last.state !== 'completed';
  return (
    <Panel title="Gửi thông báo hàng loạt (bot bán hàng)" bodyClassName="space-y-3 p-5">
      <p className="text-sm text-zinc-500">
        Bot nhắn tin tới <b>{recipients.toLocaleString('en-US')}</b> khách đã bấm Start (trừ tài khoản bị khóa). Gửi chậm ~20 tin/giây để Telegram không chặn bot.
        Định dạng: <code>&lt;b&gt;đậm&lt;/b&gt;</code>, <code>&lt;i&gt;nghiêng&lt;/i&gt;</code>, <code>&lt;a href=&quot;https://...&quot;&gt;link&lt;/a&gt;</code>.
      </p>
      <textarea className="input min-h-32 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} maxLength={3500} placeholder={'🔥 <b>Novidade!</b> Novos produtos na loja…'} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost border border-zinc-200" disabled={pending || !text.trim()} onClick={() => send(true)}>Gửi thử cho tôi</button>
        <button type="button" className="btn-primary" disabled={pending || !text.trim() || !!running || recipients === 0} onClick={() => send(false)}>{pending ? 'Đang gửi…' : `📣 Gửi tới ${recipients.toLocaleString('en-US')} khách`}</button>
        <span className="text-xs text-zinc-400">{text.length}/3500</span>
      </div>
      <FormAlert error={error} success={success} />
      {last && (
        <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-sm">
          <p className="font-medium text-zinc-700">
            Đợt gần nhất ({new Date(last.createdAt).toLocaleString('vi-VN')}):{' '}
            {running ? <span className="text-amber-600">đang gửi…</span> : last.state === 'failed' ? <span className="text-red-600">lỗi</span> : <span className="text-emerald-600">xong</span>}
          </p>
          <p className="mt-1 text-zinc-600">
            Đã gửi <b className="text-emerald-700">{last.sent.toLocaleString('en-US')}</b> / {last.total.toLocaleString('en-US')} · Lỗi (khách chặn bot) <b className="text-red-600">{last.failed.toLocaleString('en-US')}</b>
          </p>
          <p className="mt-1 line-clamp-2 font-mono text-xs whitespace-pre-wrap text-zinc-400">{last.text}</p>
          {running && <button type="button" className="mt-2 text-xs text-indigo-600 hover:underline" onClick={refresh}>Cập nhật tiến độ</button>}
        </div>
      )}
    </Panel>
  );
}
