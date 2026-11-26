'use client';

import { useState } from 'react';
import { apiRequest } from '@/lib/client-api';

export type ReviewRow = {
  id: string;
  category: string;
  srcName: string;
  srcDesc: string;
  name: string;
  description: string;
  locked: boolean;
};

// 1 dòng: tên / mô tả gốc bên trái, bản tiếng Bồ sửa được bên phải.
// "AI gợi ý" dịch lại TỪ TÊN GỐC và chỉ điền vào ô (chưa lưu); bấm Lưu mới ghi vào web + khóa bản dịch.
function Row({ r }: { r: ReviewRow }) {
  const [name, setName] = useState(r.name);
  const [desc, setDesc] = useState(r.description);
  const [saved, setSaved] = useState({ name: r.name, desc: r.description, locked: r.locked });
  const [busy, setBusy] = useState<'save' | 'ai' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = name.trim() !== saved.name || desc.trim() !== saved.desc;

  async function save() {
    setBusy('save');
    setMsg(null);
    const res = await apiRequest('/api/admin/translate/review', 'POST', { id: r.id, locale: 'pt', name: name.trim(), description: desc, lock: true });
    setBusy(null);
    if (!res.ok) return setMsg({ ok: false, text: res.data.error ?? 'Lưu thất bại' });
    setSaved({ name: name.trim(), desc: desc.trim(), locked: true });
    setMsg({ ok: true, text: 'Đã lưu và khóa' });
  }

  async function suggest() {
    setBusy('ai');
    setMsg(null);
    const res = await apiRequest<{ items: { name: string; description: string }[] }>('/api/admin/translate/preview', 'POST', { ids: [r.id], locale: 'pt' });
    setBusy(null);
    const it = res.ok ? res.data.items[0] : null;
    if (!it?.name) return setMsg({ ok: false, text: res.ok ? 'AI không trả về' : (res.data.error ?? 'AI lỗi') });
    setName(it.name);
    if (it.description) setDesc(it.description);
    setMsg({ ok: true, text: 'AI đã gợi ý từ tên gốc, xem lại rồi bấm Lưu (chưa ghi vào web)' });
  }

  return (
    <tr className="align-top">
      <td className="w-[44%] px-3 py-3">
        <p className="text-xs text-zinc-400">{r.category}</p>
        <p className="font-medium text-zinc-800">{r.srcName}</p>
        {r.srcDesc && <p className="mt-1 max-h-32 overflow-auto text-xs whitespace-pre-line text-zinc-500">{r.srcDesc}</p>}
      </td>
      <td className="px-3 py-3">
        <input className="input font-medium" maxLength={300} value={name} onChange={(e) => setName(e.target.value)} />
        <p className="mt-0.5 text-right text-[11px] text-zinc-400">{name.trim().length} ký tự</p>
        <textarea className="input mt-1 min-h-20 text-xs" maxLength={5000} value={desc} onChange={(e) => setDesc(e.target.value)} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary h-8 px-3 text-xs" disabled={!!busy || !name.trim() || (!dirty && saved.locked)} onClick={save}>{busy === 'save' ? 'Đang lưu…' : '💾 Lưu + khóa'}</button>
          <button type="button" className="btn-ghost h-8 border border-zinc-200 px-3 text-xs" disabled={!!busy} onClick={suggest}>{busy === 'ai' ? 'AI đang dịch…' : '🤖 AI gợi ý từ tên gốc'}</button>
          {dirty && <button type="button" className="text-xs text-zinc-500 hover:underline" disabled={!!busy} onClick={() => { setName(saved.name); setDesc(saved.desc); setMsg(null); }}>Hoàn tác</button>}
          {saved.locked && !dirty && <span className="text-xs text-emerald-700">🔒 Đã khóa</span>}
          {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</span>}
        </div>
      </td>
    </tr>
  );
}

export function TranslateReviewTable({ rows }: { rows: ReviewRow[] }) {
  if (!rows.length) return <p className="p-5 text-sm text-zinc-500">Không có sản phẩm nào.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="bg-zinc-50 text-xs text-zinc-500">
          <tr>
            <th className="px-3 py-2">Tên / mô tả gốc (từ nguồn)</th>
            <th className="px-3 py-2">Tiếng Bồ đang hiện trên web (sửa trực tiếp)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((r) => <Row key={r.id} r={r} />)}
        </tbody>
      </table>
    </div>
  );
}
