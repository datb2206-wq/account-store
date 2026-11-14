'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/lib/client-api';
import { FormAlert } from './form-field';

// Form tạo chiến dịch email
export function EmailCampaignForm({ activeUsers, smtpOk }: { activeUsers: number; smtpOk: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ name: '', subject: '', body: '', recipients: 'all' as 'all' | 'list', emails: '', cc: '', bcc: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));
  const listCount = new Set(f.emails.split(/[\s,;]+/).filter(Boolean)).size;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = f.recipients === 'all' ? activeUsers : listCount;
    if (!window.confirm(`Gửi email "${f.subject}" tới ${n.toLocaleString('vi-VN')} người? Không thu hồi được sau khi gửi.`)) return;
    setPending(true);
    setError(null);
    const res = await apiRequest('/api/admin/email-campaigns', 'POST', f);
    setPending(false);
    if (!res.ok) return setError(Object.values(res.data.fields ?? {}).flat()[0] ?? res.data.error ?? 'Tạo thất bại');
    router.push('/admin/email-campaigns');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormAlert error={error} />
      {!smtpOk && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">SMTP chưa bật. Chiến dịch sẽ tạm dừng cho tới khi bạn cấu hình ở trang Email.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Tên chiến dịch *</span>
          <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="VD: Khuyến mãi tháng 12" maxLength={150} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Người nhận *</span>
          <select className="input" value={f.recipients} onChange={(e) => set({ recipients: e.target.value as 'all' | 'list' })}>
            <option value="all">Tất cả thành viên ({activeUsers.toLocaleString('vi-VN')} người, trừ người đã hủy nhận tin)</option>
            <option value="list">Danh sách email nhập tay</option>
          </select>
        </label>
      </div>
      {f.recipients === 'list' && (
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Danh sách email ({listCount})</span>
          <textarea className="input min-h-24 font-mono text-xs" value={f.emails} onChange={(e) => set({ emails: e.target.value })} placeholder="Mỗi dòng 1 email, hoặc cách nhau bằng dấu phẩy" />
        </label>
      )}
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">Tiêu đề email *</span>
        <input className="input" value={f.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={300} />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">CC</span>
          <input className="input" value={f.cc} onChange={(e) => set({ cc: e.target.value })} placeholder="Không bắt buộc" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">BCC</span>
          <input className="input" value={f.bcc} onChange={(e) => set({ bcc: e.target.value })} placeholder="Không bắt buộc" />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">Nội dung email (HTML) *</span>
        <textarea className="input min-h-64 font-mono text-xs" value={f.body} onChange={(e) => set({ body: e.target.value })} placeholder={'<p>Chào {username},</p>\n<p>...</p>'} />
        <span className="mt-1 block text-xs text-zinc-400">
          Biến: <code>{'{username}'}</code> tên khách, <code>{'{email}'}</code> email khách, <code>{'{site}'}</code> tên website. Link &quot;Hủy nhận email&quot; được tự thêm vào cuối mỗi email.
        </span>
      </label>
      {f.body.trim() && (
        <div className="rounded-lg border border-zinc-200">
          <p className="border-b border-zinc-100 px-3 py-2 text-xs font-medium text-zinc-500">Xem trước</p>
          <iframe title="Xem trước" sandbox="" className="h-64 w-full" srcDoc={f.body} />
        </div>
      )}
      <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Đang tạo…' : 'Bắt đầu gửi'}</button>
    </form>
  );
}

// Nút trên từng dòng: tạm dừng / tiếp tục / xóa
export function CampaignActions({ id, name, status }: { id: string; name: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function call(method: 'PATCH' | 'DELETE', body?: unknown, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setPending(true);
    const res = await apiRequest(`/api/admin/email-campaigns/${id}`, method, body);
    setPending(false);
    if (!res.ok) window.alert(res.data.error ?? 'Thao tác thất bại');
    router.refresh();
  }
  return (
    <span className="inline-flex gap-1">
      {status === 'SENDING' && <button type="button" disabled={pending} className="btn-ghost text-xs" onClick={() => call('PATCH', { status: 'PAUSED' })}>Tạm dừng</button>}
      {status === 'PAUSED' && <button type="button" disabled={pending} className="btn-ghost text-xs text-indigo-600" onClick={() => call('PATCH', { status: 'SENDING' })}>Tiếp tục</button>}
      <button type="button" disabled={pending} className="btn-ghost text-xs text-red-600" onClick={() => call('DELETE', undefined, `Xóa chiến dịch "${name}"?`)}>Xóa</button>
    </span>
  );
}
