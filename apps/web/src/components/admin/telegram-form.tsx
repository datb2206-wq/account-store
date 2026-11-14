'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { TelegramEvent, TelegramSettings } from '@accszone/core'; // chỉ kiểu, không kéo code server vào trình duyệt
import { apiRequest } from '@/lib/client-api';
import { FormAlert } from './form-field';
import { Panel } from './ui';

const EVENT_LABELS: Record<TelegramEvent, string> = {
  order: 'Khách mua hàng',
  deposit: 'Khách nạp tiền thành công',
  refund: 'Hoàn tiền đơn hàng',
  lowBalance: 'Nguồn API sắp hết tiền',
};

export function TelegramForm({
  initial,
  hasToken,
  variables,
  defaults,
}: {
  initial: TelegramSettings;
  hasToken: boolean;
  variables: Record<TelegramEvent, [string, string][]>;
  defaults: TelegramSettings['templates'];
}) {
  const router = useRouter();
  const [f, setF] = useState<TelegramSettings>({ ...initial, botToken: '' });
  const [pending, setPending] = useState<'save' | 'test' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const set = (patch: Partial<TelegramSettings>) => setF((s) => ({ ...s, ...patch }));

  async function save() {
    setPending('save');
    setError(null);
    setSuccess(null);
    const res = await apiRequest('/api/admin/telegram', 'PUT', f);
    setPending(null);
    if (!res.ok) return setError(res.data.error ?? 'Lưu thất bại');
    setSuccess('Đã lưu. Áp dụng trong vòng 1 phút.');
    set({ botToken: '' });
    router.refresh();
  }

  async function test() {
    setPending('test');
    setError(null);
    setSuccess(null);
    const res = await apiRequest('/api/admin/telegram/test', 'POST', { botToken: f.botToken, chatId: f.chatId });
    setPending(null);
    if (!res.ok) return setError(res.data.fields?.chatId?.[0] ?? res.data.error ?? 'Gửi thử thất bại');
    setSuccess('Đã gửi tin thử. Kiểm tra Telegram của bạn.');
  }

  return (
    <div className="space-y-5">
      <FormAlert error={error} success={success} />

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Panel title="Kết nối bot" bodyClassName="space-y-4 p-5">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <input type="checkbox" checked={f.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
            Bật thông báo Telegram
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Bot Token</span>
            <input
              className="input font-mono text-xs"
              type="password"
              name="telegram-bot-token"
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              value={f.botToken}
              onChange={(e) => set({ botToken: e.target.value })}
              placeholder={hasToken ? 'Đã lưu, để trống = giữ nguyên' : '123456789:AAH...'}
            />
            <span className="mt-1 block text-xs text-zinc-400">Mở Telegram, chat với <b>@BotFather</b>, gõ /newbot rồi làm theo hướng dẫn để nhận token.</span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Chat ID</span>
            <input className="input font-mono text-xs" value={f.chatId} onChange={(e) => set({ chatId: e.target.value })} placeholder="VD: 123456789 hoặc -100123456789 (nhóm)" />
            <span className="mt-1 block text-xs text-zinc-400">
              Nhắn 1 tin bất kỳ cho bot (hoặc thêm bot vào nhóm), rồi chat với <b>@userinfobot</b> để lấy ID của bạn. Nhóm có ID bắt đầu bằng -100.
            </span>
          </label>
          <button type="button" className="btn-ghost border border-zinc-200" disabled={!!pending} onClick={test}>{pending === 'test' ? 'Đang gửi…' : '✈ Gửi tin thử'}</button>
        </Panel>

        <Panel title="Gửi thông báo khi" bodyClassName="space-y-3 p-5">
          {(Object.keys(EVENT_LABELS) as TelegramEvent[]).map((ev) => (
            <label key={ev} className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={f.events[ev]} onChange={(e) => set({ events: { ...f.events, [ev]: e.target.checked } })} />
              {EVENT_LABELS[ev]}
            </label>
          ))}
          <label className="block pt-2 text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Báo khi số dư nguồn API dưới</span>
            <div className="flex w-48">
              <span className="grid place-items-center rounded-l-lg border border-r-0 border-zinc-300 bg-zinc-50 px-3 text-zinc-500">$</span>
              <input className="input rounded-l-none tabular-nums" inputMode="decimal" value={f.lowBalanceUsd} onChange={(e) => set({ lowBalanceUsd: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} />
            </div>
            <span className="mt-1 block text-xs text-zinc-400">Kiểm tra sau mỗi lần đồng bộ (cần worker đang chạy). Báo tối đa 1 lần / 6 giờ cho mỗi nguồn.</span>
          </label>
        </Panel>
      </div>

      <Panel title="Nội dung tin nhắn" bodyClassName="divide-y divide-zinc-100">
        {(Object.keys(EVENT_LABELS) as TelegramEvent[]).map((ev) => (
          <div key={ev} className="grid gap-3 p-5 lg:grid-cols-[1fr_260px]">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-700">{EVENT_LABELS[ev]}</span>
                <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => set({ templates: { ...f.templates, [ev]: defaults[ev] } })}>Dùng mẫu mặc định</button>
              </div>
              <textarea className="input min-h-28 font-mono text-xs" value={f.templates[ev]} onChange={(e) => set({ templates: { ...f.templates, [ev]: e.target.value } })} />
            </div>
            <ul className="space-y-0.5 text-xs text-zinc-500">
              {variables[ev].map(([k, label]) => (
                <li key={k}><code className="text-violet-700">{`{${k}}`}</code> {label}</li>
              ))}
              <li className="pt-1 text-zinc-400">Dùng được thẻ &lt;b&gt;, &lt;i&gt;, &lt;code&gt;. Để trống = không gửi loại này.</li>
            </ul>
          </div>
        ))}
      </Panel>

      <button type="button" className="btn-primary" disabled={!!pending} onClick={save}>{pending === 'save' ? 'Đang lưu…' : 'Lưu cấu hình Telegram'}</button>
    </div>
  );
}
