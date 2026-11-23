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

type AlertKind = keyof TelegramSettings['alerts'];
const ALERT_LABELS: Record<AlertKind, [string, string]> = {
  adminAction: ['⚙️ Admin thao tác trên web', 'Đổi cài đặt, giao diện, ngân hàng, tiền tệ… kèm tài khoản và IP'],
  supplierNoFunds: ['⚠️ Nguồn API hết tiền', 'Khách mua mà nguồn không đủ số dư để giao hàng'],
  newUser: ['👤 Thành viên mới đăng ký', 'Tên tài khoản và IP'],
  adminLogin: ['🔐 Admin đăng nhập', 'IP, thiết bị; đánh dấu "IP MỚI" nếu IP lạ'],
  systemError: ['🔴 Web có lỗi nghiêm trọng', 'Worker / công việc tự động (quét nạp USDT, đồng bộ…) bị dừng hoặc lỗi'],
  supplierIssue: ['🟠 Nguồn API có vấn đề', 'Nguồn trả lỗi hoặc quá 30 phút không đồng bộ'],
  lowStock: ['🟡 Kho riêng sắp hết hàng', 'Theo ngưỡng bên dưới'],
  bankUnmatched: ['🟠 Tiền vào ngân hàng chưa cộng', 'Quá 15 phút chưa cộng cho khách, kèm mã GD, số tiền, nội dung CK'],
  duplicateCredit: ['🔴 Cộng tiền trùng', '1 mã giao dịch được cộng từ 2 lần trở lên'],
  dailyReport: ['📊 Báo cáo cuối ngày 23:55', 'Đơn, doanh thu, lợi nhuận, tổng nạp, thành viên mới, số dư nguồn API'],
};
const ALERT_GROUPS: [string, AlertKind[]][] = [
  ['Báo ngay khi có sự việc', ['adminAction', 'supplierNoFunds', 'newUser', 'adminLogin', 'dailyReport']],
  ['Bot tự kiểm tra mỗi 5 phút', ['systemError', 'supplierIssue', 'lowStock', 'bankUnmatched', 'duplicateCredit']],
];

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
          <div className="space-y-1 border-t border-zinc-100 pt-4">
            <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
              <input type="checkbox" checked={f.adminCommands} onChange={(e) => set({ adminCommands: e.target.checked })} />
              Nhận lệnh admin qua bot này (bot admin)
            </label>
            <span className="block text-xs text-zinc-400">
              Bật rồi bấm Lưu, sau đó bấm &quot;Kết nối Telegram của tôi&quot; ở bên dưới. Dùng được: /doanhthu, /sodu, /nap (duyệt nạp bằng nút), /don, /khach, /congtien, /sp. Chỉ nhân viên đã kết nối mới ra lệnh được, đúng quyền như trên web.
            </span>
          </div>
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

      <Panel title="Cảnh báo tự động" bodyClassName="space-y-4 p-5">
        <p className="text-sm text-zinc-500">Gửi vào cùng Chat ID ở trên. Bot tự kiểm tra mỗi 5 phút; cùng 1 sự cố chỉ nhắc lại sau 6 giờ, hết sự cố bot báo &quot;✅ đã ổn định lại&quot;.</p>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          {ALERT_GROUPS.map(([title, keys]) => (
            <div key={title} className="space-y-2">
              <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">{title}</p>
              {keys.map((k) => (
                <label key={k} className="flex items-start gap-2 text-sm text-zinc-700">
                  <input type="checkbox" className="mt-0.5" checked={f.alerts[k]} onChange={(e) => set({ alerts: { ...f.alerts, [k]: e.target.checked } })} />
                  <span>
                    {ALERT_LABELS[k][0]}
                    <span className="block text-xs text-zinc-400">{ALERT_LABELS[k][1]}</span>
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Báo khi sản phẩm kho riêng còn dưới</span>
          <input className="input w-32 tabular-nums" inputMode="numeric" value={f.lowStockQty} onChange={(e) => set({ lowStockQty: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
          <span className="mt-1 block text-xs text-zinc-400">tài khoản (mỗi sản phẩm báo 1 lần, nhập thêm hàng rồi hết lại thì báo tiếp)</span>
        </label>
      </Panel>

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
