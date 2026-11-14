'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CardSettings, ManualMethod } from '@accszone/core'; // chỉ kiểu
import { apiRequest } from '@/lib/client-api';
import { FormAlert } from './form-field';
import { Panel } from './ui';

type CardForm = Omit<CardSettings, 'partnerKey'> & { partnerKey: string };

function useSave() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  async function save(body: object, ok: string) {
    setPending(true);
    setError(null);
    setSuccess(null);
    const res = await apiRequest('/api/admin/payments', 'PUT', body);
    setPending(false);
    if (!res.ok) return setError(res.data.error ?? 'Lưu thất bại'), false;
    setSuccess(ok);
    router.refresh();
    return true;
  }
  return { pending, error, success, save };
}

const num = (v: string) => Number(v.replace(/[^\d.]/g, '')) || 0;

export function CardSettingsForm({ initial, hasKey, labels, callbackUrl }: { initial: CardForm; hasKey: boolean; labels: Record<string, string>; callbackUrl: string }) {
  const [f, setF] = useState(initial);
  const [amountsText, setAmountsText] = useState(initial.amounts.join(', '));
  const { pending, error, success, save } = useSave();
  const set = (patch: Partial<CardForm>) => setF((s) => ({ ...s, ...patch }));
  const telcoState = (code: string) => f.telcos.find((t) => t.code === code);
  const setTelco = (code: string, patch: { fee?: number; enabled?: boolean }) =>
    setF((s) => {
      const exists = s.telcos.some((t) => t.code === code);
      const telcos = exists
        ? s.telcos.map((t) => (t.code === code ? { ...t, ...patch } : t))
        : [...s.telcos, { code: code as CardSettings['telcos'][number]['code'], fee: 20, enabled: false, ...patch }];
      return { ...s, telcos };
    });

  async function submit() {
    const amounts = amountsText.split(/[,\s]+/).map((x) => Number(x.replace(/\D/g, ''))).filter((x) => x > 0);
    if (await save({ card: { ...f, amounts } }, 'Đã lưu cấu hình thẻ cào.')) set({ partnerKey: '' });
  }

  return (
    <Panel title="Thẻ cào (đối tác đổi thẻ)">
      <div className="space-y-4">
        <p className="text-sm text-zinc-500">
          Dùng được với các web đổi thẻ hỗ trợ API <b>chargingws/v2</b> (đăng ký tài khoản đối tác, lấy Partner ID / Partner Key). Đặt URL callback ở trang đối tác:{' '}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs break-all">{callbackUrl}</code>
        </p>
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <input type="checkbox" checked={f.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Bật nạp thẻ cào
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">URL web đối tác</span>
            <input className="input" placeholder="https://doithe-vidu.vn" value={f.apiUrl} onChange={(e) => set({ apiUrl: e.target.value.trim() })} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Partner ID</span>
            <input className="input font-mono" value={f.partnerId} onChange={(e) => set({ partnerId: e.target.value.trim() })} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Partner Key</span>
            <input className="input font-mono" type="password" autoComplete="new-password" placeholder={hasKey ? '•••••••• (để trống = giữ nguyên)' : ''} value={f.partnerKey} onChange={(e) => set({ partnerKey: e.target.value.trim() })} />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Mệnh giá cho khách chọn (VND)</span>
            <input className="input tabular-nums" value={amountsText} onChange={(e) => setAmountsText(e.target.value)} />
            <span className="mt-1 block text-xs text-zinc-400">Cách nhau bằng dấu phẩy, VD 10000, 20000, 50000</span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Sai mệnh giá: khách nhận (%)</span>
            <input className="input tabular-nums" inputMode="decimal" value={f.wrongValuePercent} onChange={(e) => set({ wrongValuePercent: num(e.target.value) })} />
            <span className="mt-1 block text-xs text-zinc-400">% của mệnh giá thật (sau phí) khi khách chọn sai mệnh giá. Thường 50%.</span>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Nhà mạng</th><th>Bật</th><th>Phí thu khách (%)</th><th>Khách nhận / thẻ 100.000đ</th></tr></thead>
            <tbody>
              {Object.entries(labels).map(([code, label]) => {
                const t = telcoState(code);
                return (
                  <tr key={code}>
                    <td className="font-medium">{label}</td>
                    <td><input type="checkbox" checked={!!t?.enabled} onChange={(e) => setTelco(code, { enabled: e.target.checked })} /></td>
                    <td><input className="input w-24 tabular-nums" inputMode="decimal" value={t?.fee ?? 20} onChange={(e) => setTelco(code, { fee: num(e.target.value) })} /></td>
                    <td className="text-zinc-500 tabular-nums">{(100_000 * (100 - (t?.fee ?? 20)) / 100).toLocaleString('vi-VN')}đ</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-400">Đặt phí cao hơn chiết khấu của đối tác để có lãi. Tiền cộng cho khách quy đổi sang USD theo tỷ giá VND ở trang Tiền tệ.</p>
        <FormAlert error={error} success={success} />
        <button type="button" className="btn-primary" disabled={pending} onClick={submit}>{pending ? 'Đang lưu…' : 'Lưu thẻ cào'}</button>
      </div>
    </Panel>
  );
}

const blank = (kind: ManualMethod['kind']): ManualMethod => ({
  id: kind === 'momo' ? 'momo' : `method-${Math.random().toString(36).slice(2, 6)}`,
  kind,
  name: kind === 'momo' ? 'MoMo' : '',
  accountNo: '',
  accountName: '',
  currency: kind === 'momo' ? 'VND' : 'USD',
  instructions: '',
  enabled: true,
});

export function ManualMethodsForm({ initial, currencies }: { initial: ManualMethod[]; currencies: string[] }) {
  const [list, setList] = useState(initial);
  const { pending, error, success, save } = useSave();
  const update = (i: number, patch: Partial<ManualMethod>) => setList((l) => l.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  return (
    <Panel
      title="MoMo & nạp thủ công"
      action={
        <span className="flex gap-2">
          <button type="button" className="btn-ghost border border-zinc-200 text-xs" onClick={() => setList((l) => [...l, blank('momo')])}>+ MoMo</button>
          <button type="button" className="btn-ghost border border-zinc-200 text-xs" onClick={() => setList((l) => [...l, blank('custom')])}>+ Phương thức khác</button>
        </span>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-zinc-500">
          Khách chọn phương thức, chuyển tiền kèm mã nội dung NAPxxxxxx rồi bấm báo đã chuyển (mã giao dịch / ảnh biên lai). Bạn duyệt ở trang <a href="/admin/transactions" className="text-indigo-600 hover:underline">Nạp tiền</a>. Webhook ngân hàng cũng tự khớp mã nếu dịch vụ của bạn đọc được giao dịch MoMo.
        </p>
        {list.length === 0 && <p className="rounded-lg bg-zinc-50 py-6 text-center text-sm text-zinc-400">Chưa có phương thức nào</p>}
        {list.map((m, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-zinc-200 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${m.kind === 'momo' ? 'bg-pink-50 text-pink-700' : 'bg-zinc-100 text-zinc-600'}`}>{m.kind === 'momo' ? 'MoMo' : 'Thủ công'}</span>
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={m.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} /> Đang bật</label>
              <button type="button" className="ml-auto text-xs text-red-600 hover:underline" onClick={() => setList((l) => l.filter((_, j) => j !== i))}>Xóa</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="block text-sm"><span className="mb-1 block font-medium text-zinc-700">Tên hiển thị</span><input className="input" value={m.name} placeholder="VD PayPal" onChange={(e) => update(i, { name: e.target.value })} /></label>
              <label className="block text-sm"><span className="mb-1 block font-medium text-zinc-700">{m.kind === 'momo' ? 'Số điện thoại MoMo' : 'Tài khoản / ID nhận'}</span><input className="input font-mono" value={m.accountNo} onChange={(e) => update(i, { accountNo: e.target.value })} /></label>
              <label className="block text-sm"><span className="mb-1 block font-medium text-zinc-700">Tên người nhận</span><input className="input" value={m.accountName} onChange={(e) => update(i, { accountName: e.target.value })} /></label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-zinc-700">Tiền tệ</span>
                <select className="input" value={m.currency} onChange={(e) => update(i, { currency: e.target.value })}>
                  {[...new Set(['USD', ...currencies, m.currency])].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <label className="block text-sm"><span className="mb-1 block font-medium text-zinc-700">Mã (không trùng)</span><input className="input font-mono" value={m.id} onChange={(e) => update(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} /></label>
              <label className="block text-sm"><span className="mb-1 block font-medium text-zinc-700">Hướng dẫn cho khách (tùy chọn)</span><textarea className="input min-h-16" value={m.instructions} onChange={(e) => update(i, { instructions: e.target.value })} /></label>
            </div>
          </div>
        ))}
        <p className="text-xs text-zinc-400">Tiền tệ khác USD cần có tỷ giá ở trang Tiền tệ, nếu không phương thức sẽ không hiện cho khách.</p>
        <FormAlert error={error} success={success} />
        <button type="button" className="btn-primary" disabled={pending} onClick={() => save({ manual: list }, 'Đã lưu phương thức nạp.')}>{pending ? 'Đang lưu…' : 'Lưu phương thức'}</button>
      </div>
    </Panel>
  );
}

export function CardCheckButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function check() {
    setPending(true);
    const res = await apiRequest<{ status: string }>(`/api/admin/transactions/${id}/card-check`, 'POST');
    setPending(false);
    setMsg(res.ok ? `Kết quả: ${res.data.status}` : (res.data.error ?? 'Thất bại'));
    router.refresh();
  }
  return (
    <div className="space-y-1">
      <button type="button" className="btn-primary" disabled={pending} onClick={check}>{pending ? 'Đang hỏi…' : 'Kiểm tra lại với đối tác'}</button>
      {msg && <p className="text-xs text-zinc-500">{msg}</p>}
    </div>
  );
}
