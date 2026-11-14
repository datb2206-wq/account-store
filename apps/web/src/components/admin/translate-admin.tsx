'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { TranslateSettings } from '@accszone/core'; // chỉ kiểu
import { apiRequest } from '@/lib/client-api';
import { FormAlert } from './form-field';

export const LOCALE_LABEL = { id: 'Tiếng Indonesia', ru: 'Tiếng Nga', zh: 'Tiếng Trung' } as const;
type Locale = keyof typeof LOCALE_LABEL;

const MODELS = [
  ['claude-opus-5-5', 'Claude Opus 5.5 (mặc định, dịch tốt nhất)'],
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (rẻ hơn ~2 lần)'],
  ['claude-haiku-5-5', 'Claude Haiku 5.5 (rẻ nhất, ~40 lần)'],
] as const;

export function TranslateSettingsForm({ initial, hasKey, hasAzureKey }: { initial: Omit<TranslateSettings, 'apiKey' | 'azureKey'>; hasKey: boolean; hasAzureKey: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ ...initial, apiKey: '', azureKey: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const toggle = (l: Locale) => setF((s) => ({ ...s, targets: s.targets.includes(l) ? s.targets.filter((x) => x !== l) : [...s.targets, l] }));

  async function save() {
    setPending(true);
    setError(null);
    setSuccess(null);
    const res = await apiRequest('/api/admin/translate', 'PUT', f);
    setPending(false);
    if (!res.ok) return setError(res.data.error ?? 'Lưu thất bại');
    setSuccess('Đã lưu cấu hình dịch.');
    setF((s) => ({ ...s, apiKey: '', azureKey: '' }));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 text-sm">
        <span className="block font-medium text-zinc-700">Dịch bằng</span>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2"><input type="radio" checked={f.provider === 'azure'} onChange={() => setF((s) => ({ ...s, provider: 'azure' }))} />Microsoft Azure Translator <span className="rounded bg-emerald-50 px-1.5 text-xs font-medium text-emerald-700">miễn phí 2 triệu ký tự/tháng</span></label>
          <label className="flex items-center gap-2"><input type="radio" checked={f.provider === 'claude'} onChange={() => setF((s) => ({ ...s, provider: 'claude' }))} />Claude AI (trả phí, dịch tự nhiên hơn)</label>
        </div>
      </div>

      {f.provider === 'azure' && (
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Key Azure Translator (KEY 1)</span>
              <input className="input font-mono" type="password" autoComplete="new-password" placeholder={hasAzureKey ? '•••••••• (để trống = giữ nguyên)' : ''} value={f.azureKey} onChange={(e) => setF((s) => ({ ...s, azureKey: e.target.value.trim() }))} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Location / Region</span>
              <input className="input font-mono" placeholder="VD southeastasia" value={f.azureRegion} onChange={(e) => setF((s) => ({ ...s, azureRegion: e.target.value.trim().toLowerCase() }))} />
            </label>
          </div>
          <ol className="list-decimal space-y-0.5 rounded-lg bg-zinc-50 py-3 pr-3 pl-8 text-xs text-zinc-600">
            <li>Đăng ký tài khoản miễn phí ở portal.azure.com (cần thẻ Visa/Mastercard để xác minh, không bị trừ tiền khi dùng gói Free).</li>
            <li>Tìm &quot;Translator&quot; → Create → Pricing tier chọn <b>Free F0</b>, Region chọn <b>Southeast Asia</b> → Review + create.</li>
            <li>Mở resource vừa tạo → <b>Keys and Endpoint</b> → copy <b>KEY 1</b> và <b>Location/Region</b> dán vào 2 ô trên.</li>
          </ol>
        </div>
      )}

      <div className={`grid gap-4 sm:grid-cols-2 ${f.provider === 'claude' ? '' : 'hidden'}`}>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">API key Anthropic</span>
          <input className="input font-mono" type="password" autoComplete="new-password" placeholder={hasKey ? '•••••••• (để trống = giữ nguyên)' : 'sk-ant-...'} value={f.apiKey} onChange={(e) => setF((s) => ({ ...s, apiKey: e.target.value.trim() }))} />
          <span className="mt-1 block text-xs text-zinc-400">Tạo key ở console.anthropic.com → API Keys (cần nạp credit). Key chỉ lưu trên server.</span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Model</span>
          <select className="input" value={f.model} onChange={(e) => setF((s) => ({ ...s, model: e.target.value }))}>
            {MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            {!MODELS.some(([v]) => v === f.model) && <option value={f.model}>{f.model}</option>}
          </select>
        </label>
      </div>
      <div className="space-y-2 text-sm">
        <span className="block font-medium text-zinc-700">Dịch sang</span>
        <div className="flex flex-wrap gap-4">
          {(Object.keys(LOCALE_LABEL) as Locale[]).map((l) => (
            <label key={l} className="flex items-center gap-2"><input type="checkbox" checked={f.targets.includes(l)} onChange={() => toggle(l)} />{LOCALE_LABEL[l]}</label>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.description} onChange={(e) => setF((s) => ({ ...s, description: e.target.checked }))} />Dịch cả mô tả (dài hơn tên khoảng 5–10 lần: tốn hạn mức / chi phí hơn)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.autoNew} onChange={(e) => setF((s) => ({ ...s, autoNew: e.target.checked }))} />Tự dịch sản phẩm mới / chưa có bản dịch (worker kiểm tra mỗi phút)</label>
      </div>
      <FormAlert error={error} success={success} />
      <button type="button" className="btn-primary" disabled={pending} onClick={save}>{pending ? 'Đang lưu…' : 'Lưu cấu hình'}</button>
    </div>
  );
}

export function TranslateActions({ running, canStart }: { running: boolean; canStart: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function start(overwrite: boolean) {
    const msg = overwrite
      ? 'Dịch LẠI toàn bộ sản phẩm đang bán? Tên bạn đã tự sửa ở các ngôn ngữ đích sẽ bị thay bằng bản dịch mới.'
      : 'Dịch tất cả sản phẩm đang bán CHƯA có bản dịch?';
    if (!window.confirm(msg)) return;
    setPending(true);
    const res = await apiRequest<{ total: number }>('/api/admin/translate/start', 'POST', { all: true, overwrite });
    setPending(false);
    if (!res.ok) return window.alert(res.data.error ?? 'Không bắt đầu được');
    router.refresh();
  }
  async function stop() {
    setPending(true);
    await apiRequest('/api/admin/translate/stop', 'POST');
    setPending(false);
    router.refresh();
  }
  if (running) return <button type="button" className="btn-ghost border border-red-200 text-red-600" disabled={pending} onClick={stop}>Dừng lượt dịch</button>;
  return (
    <span className="flex flex-wrap gap-2">
      <button type="button" className="btn-primary" disabled={pending || !canStart} onClick={() => start(false)}>🌐 Dịch sản phẩm chưa có bản dịch</button>
      <button type="button" className="btn-ghost border border-zinc-200" disabled={pending || !canStart} onClick={() => start(true)}>Dịch lại tất cả</button>
    </span>
  );
}
