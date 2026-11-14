'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CtvSettings } from '@accszone/core'; // chỉ kiểu
import { apiRequest } from '@/lib/client-api';
import { FormAlert } from './form-field';

const num = (v: string) => Number(v.replace(/[^\d.]/g, '')) || 0;

export function CtvSettingsForm({ initial }: { initial: CtvSettings }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const set = (patch: Partial<CtvSettings>) => setF((s) => ({ ...s, ...patch }));

  async function save() {
    setPending(true);
    setError(null);
    setSuccess(null);
    const res = await apiRequest('/api/admin/ctv', 'PUT', f);
    setPending(false);
    if (!res.ok) return setError(res.data.error ?? 'Lưu thất bại');
    setSuccess('Đã lưu cấu hình CTV.');
    router.refresh();
  }

  const check = (key: keyof CtvSettings, label: string) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f[key] as boolean} onChange={(e) => set({ [key]: e.target.checked })} />{label}</label>
  );

  return (
    <div className="space-y-4">
      <FormAlert error={error} success={success} />
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {check('enabled', 'Bật kênh CTV (khách thấy "Seller panel" trong trang tài khoản)')}
        {check('allowApply', 'Cho khách tự đăng ký làm CTV')}
        {check('autoApproveProducts', 'Tự duyệt sản phẩm CTV đăng (không cần admin duyệt)')}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Phí sàn mặc định (%)</span>
          <input className="input tabular-nums" inputMode="decimal" value={f.commissionPercent} onChange={(e) => set({ commissionPercent: num(e.target.value) })} />
          <span className="mt-1 block text-xs text-zinc-400">Web giữ % này mỗi đơn, phần còn lại cộng cho CTV. Đặt riêng từng CTV ở danh sách bên dưới.</span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Cộng tiền người bán sau</span>
          <div className="flex">
            <input className="input rounded-r-none tabular-nums" inputMode="numeric" value={f.holdHours} onChange={(e) => set({ holdHours: Math.round(num(e.target.value)) })} />
            <span className="grid place-items-center rounded-r-lg border border-l-0 border-zinc-300 bg-zinc-50 px-3 text-zinc-500">giờ</span>
          </div>
          <span className="mt-1 block text-xs text-zinc-400">0 = cộng ngay khi bán. Nên đặt bằng thời gian bảo hành để kịp hoàn tiền khi hàng lỗi.</span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Rút tối thiểu (USD)</span>
          <input className="input tabular-nums" inputMode="decimal" value={f.minWithdraw} onChange={(e) => set({ minWithdraw: num(e.target.value) })} />
        </label>
        <div className="space-y-2 text-sm">
          <span className="block font-medium text-zinc-700">Cho phép rút</span>
          {check('allowBalance', 'Vào số dư mua hàng (tức thì)')}
          {check('allowBank', 'Về ngân hàng (admin duyệt)')}
        </div>
      </div>
      <button type="button" className="btn-primary" disabled={pending} onClick={save}>{pending ? 'Đang lưu…' : 'Lưu cấu hình'}</button>
    </div>
  );
}

async function post(url: string, body: object) {
  const res = await apiRequest(url, 'POST', body);
  if (!res.ok) window.alert(res.data.error ?? 'Thao tác thất bại');
  return res.ok;
}

export function SellerActions({ id, status, commission, defaultFee }: { id: string; status: string; commission: string | null; defaultFee: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const run = async (body: object, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    setPending(true);
    if (await post(`/api/admin/ctv/sellers/${id}`, body)) router.refresh();
    setPending(false);
  };
  const withNote = (status: string, ask: string) => {
    const note = window.prompt(ask, '');
    if (note === null) return;
    void run({ status, note });
  };
  const setFee = () => {
    const v = window.prompt(`Phí sàn riêng cho CTV này (%). Để trống = dùng mặc định ${defaultFee}%`, commission ?? '');
    if (v === null) return;
    void run({ commissionPercent: v.trim() === '' ? null : Number(v.replace(',', '.')) });
  };
  return (
    <span className="inline-flex flex-wrap justify-end gap-1">
      {status !== 'ACTIVE' && <button type="button" disabled={pending} className="btn-ghost px-2 py-1 text-xs text-emerald-700" onClick={() => run({ status: 'ACTIVE' }, 'Duyệt / mở lại CTV này?')}>{status === 'SUSPENDED' ? 'Mở khóa' : 'Duyệt'}</button>}
      {status === 'PENDING' && <button type="button" disabled={pending} className="btn-ghost px-2 py-1 text-xs text-red-600" onClick={() => withNote('REJECTED', 'Lý do từ chối (CTV sẽ thấy):')}>Từ chối</button>}
      {status === 'ACTIVE' && <button type="button" disabled={pending} className="btn-ghost px-2 py-1 text-xs text-red-600" onClick={() => withNote('SUSPENDED', 'Lý do khóa (toàn bộ sản phẩm của CTV sẽ bị ẩn):')}>Khóa</button>}
      <button type="button" disabled={pending} className="btn-ghost px-2 py-1 text-xs" onClick={setFee}>Phí sàn</button>
    </span>
  );
}

export function ProductReviewActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function review(approve: boolean) {
    const reason = approve ? '' : window.prompt('Lý do từ chối (CTV sẽ thấy và sửa lại):', '');
    if (reason === null) return;
    if (approve && !window.confirm('Duyệt sản phẩm này? Sản phẩm sẽ hiện trên web ngay.')) return;
    setPending(true);
    if (await post(`/api/admin/ctv/products/${id}`, { approve, reason })) router.refresh();
    setPending(false);
  }
  return (
    <span className="inline-flex gap-1">
      <button type="button" disabled={pending} className="btn-ghost px-2 py-1 text-xs text-emerald-700" onClick={() => review(true)}>Duyệt</button>
      <button type="button" disabled={pending} className="btn-ghost px-2 py-1 text-xs text-red-600" onClick={() => review(false)}>Từ chối</button>
    </span>
  );
}

export function SellerWithdrawalActions({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function review(approve: boolean) {
    const note = approve ? (window.confirm(`Xác nhận ĐÃ CHUYỂN KHOẢN ${label}?`) ? '' : null) : window.prompt('Lý do từ chối (tiền được trả lại cho CTV):', '');
    if (note === null) return;
    setPending(true);
    if (await post(`/api/admin/ctv/withdrawals/${id}`, { approve, note })) router.refresh();
    setPending(false);
  }
  return (
    <span className="inline-flex gap-1">
      <button type="button" disabled={pending} className="btn-ghost text-xs text-emerald-700" onClick={() => review(true)}>Đã chuyển</button>
      <button type="button" disabled={pending} className="btn-ghost text-xs text-red-600" onClick={() => review(false)}>Từ chối</button>
    </span>
  );
}
