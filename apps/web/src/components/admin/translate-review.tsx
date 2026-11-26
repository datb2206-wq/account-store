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

type Draft = { name: string; desc: string };
type Msg = { ok: boolean; text: string };

// Bảng duyệt: tên / mô tả gốc bên trái, bản tiếng Bồ sửa được bên phải.
// "AI gợi ý" dịch lại TỪ TÊN GỐC và chỉ điền vào ô (chưa ghi); bấm Lưu mới ghi vào web + khóa bản dịch.
export function TranslateReviewTable({ rows }: { rows: ReviewRow[] }) {
  const [draft, setDraft] = useState<Record<string, Draft>>(() => Object.fromEntries(rows.map((r) => [r.id, { name: r.name, desc: r.description }])));
  const [saved, setSaved] = useState<Record<string, Draft & { locked: boolean }>>(() => Object.fromEntries(rows.map((r) => [r.id, { name: r.name, desc: r.description, locked: r.locked }])));
  const [suggested, setSuggested] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Record<string, 'save' | 'ai'>>({});
  const [msg, setMsg] = useState<Record<string, Msg>>({});
  const [bulk, setBulk] = useState<string | null>(null);
  const [bulkMsg, setBulkMsg] = useState<Msg | null>(null);

  const isDirty = (id: string) => draft[id]!.name.trim() !== saved[id]!.name || draft[id]!.desc.trim() !== saved[id]!.desc;
  const dirtyIds = rows.map((r) => r.id).filter(isDirty);
  const setRow = (id: string, d: Partial<Draft>) => setDraft((s) => ({ ...s, [id]: { ...s[id]!, ...d } }));
  const setRowMsg = (id: string, m: Msg | null) => setMsg((s) => { const n = { ...s }; if (m) n[id] = m; else delete n[id]; return n; });

  async function save(id: string) {
    const d = draft[id]!;
    if (!d.name.trim()) return setRowMsg(id, { ok: false, text: 'Tên trống' });
    setBusy((s) => ({ ...s, [id]: 'save' }));
    const res = await apiRequest('/api/admin/translate/review', 'POST', { id, locale: 'pt', name: d.name.trim(), description: d.desc, lock: true });
    setBusy((s) => { const n = { ...s }; delete n[id]; return n; });
    if (!res.ok) { setRowMsg(id, { ok: false, text: res.data.error ?? 'Lưu thất bại' }); return false; }
    setSaved((s) => ({ ...s, [id]: { name: d.name.trim(), desc: d.desc.trim(), locked: true } }));
    setSuggested((s) => { const n = new Set(s); n.delete(id); return n; });
    setRowMsg(id, { ok: true, text: 'Đã lưu và khóa' });
    return true;
  }

  // AI dịch lại từ tên gốc cho các id (tối đa 20 / lần), chỉ điền vào ô
  async function suggest(ids: string[]) {
    const res = await apiRequest<{ items: { id: string; name: string; description: string }[] }>('/api/admin/translate/preview', 'POST', { ids, locale: 'pt' });
    if (!res.ok) return res.data.error ?? 'AI lỗi';
    const got = new Set<string>();
    setDraft((s) => {
      const n = { ...s };
      for (const it of res.data.items) if (it.name && n[it.id]) { n[it.id] = { name: it.name, desc: it.description || n[it.id]!.desc }; got.add(it.id); }
      return n;
    });
    setSuggested((s) => new Set([...s, ...got]));
    for (const id of ids) setRowMsg(id, got.has(id) ? { ok: true, text: 'AI gợi ý từ tên gốc — xem lại rồi Lưu (chưa ghi)' } : { ok: false, text: 'AI không trả về' });
    return null;
  }

  async function suggestOne(id: string) {
    setBusy((s) => ({ ...s, [id]: 'ai' }));
    const err = await suggest([id]);
    setBusy((s) => { const n = { ...s }; delete n[id]; return n; });
    if (err) setRowMsg(id, { ok: false, text: err });
  }

  async function suggestAll() {
    if (!window.confirm(`AI dịch lại từ tên gốc cho ${rows.length} sản phẩm trên trang này? Chỉ điền vào ô để bạn duyệt, chưa ghi vào web (tốn ít tiền Gemini).`)) return;
    setBulkMsg(null);
    const ids = rows.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 20) {
      setBulk(`AI đang dịch ${Math.min(i + 20, ids.length)}/${ids.length}…`);
      const err = await suggest(ids.slice(i, i + 20));
      if (err) { setBulk(null); return setBulkMsg({ ok: false, text: err }); }
    }
    setBulk(null);
    setBulkMsg({ ok: true, text: 'AI đã gợi ý xong (ô viền vàng). Sửa chỗ chưa ưng, bấm "Hoàn tác" ở dòng không muốn đổi, rồi "Lưu tất cả".' });
  }

  async function saveAll() {
    if (!dirtyIds.length || !window.confirm(`Lưu ${dirtyIds.length} sản phẩm đã sửa vào web và khóa bản dịch?`)) return;
    let ok = 0;
    for (const [i, id] of dirtyIds.entries()) {
      setBulk(`Đang lưu ${i + 1}/${dirtyIds.length}…`);
      if (await save(id)) ok++;
    }
    setBulk(null);
    setBulkMsg({ ok: ok === dirtyIds.length, text: `Đã lưu ${ok}/${dirtyIds.length} sản phẩm.` });
  }

  if (!rows.length) return <p className="p-5 text-sm text-zinc-500">Không có sản phẩm nào.</p>;
  return (
    <div>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-zinc-100 bg-white px-3 py-2">
        <button type="button" className="btn-ghost h-8 border border-zinc-200 px-3 text-xs" disabled={!!bulk} onClick={suggestAll}>🤖 AI gợi ý cả trang ({rows.length})</button>
        <button type="button" className="btn-primary h-8 px-3 text-xs" disabled={!!bulk || !dirtyIds.length} onClick={saveAll}>💾 Lưu tất cả đã sửa ({dirtyIds.length})</button>
        {bulk && <span className="text-xs text-zinc-500">{bulk}</span>}
        {bulkMsg && <span className={`text-xs ${bulkMsg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{bulkMsg.text}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2">Tên / mô tả gốc (từ nguồn)</th>
              <th className="px-3 py-2">Tiếng Bồ trên web (sửa trực tiếp)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => {
              const d = draft[r.id]!;
              const sv = saved[r.id]!;
              const dirty = isDirty(r.id);
              const ai = suggested.has(r.id) && dirty;
              const m = msg[r.id];
              const b = busy[r.id];
              return (
                <tr key={r.id} className="align-top">
                  <td className="w-[42%] px-3 py-3">
                    <p className="text-xs text-zinc-400">{r.category}</p>
                    <p className="font-medium text-zinc-800">{r.srcName}</p>
                    {r.srcDesc && <p className="mt-1 max-h-32 overflow-auto text-xs whitespace-pre-line text-zinc-500">{r.srcDesc}</p>}
                    {ai && sv.name && <p className="mt-2 rounded bg-zinc-50 px-2 py-1 text-xs text-zinc-500"><span className="text-zinc-400">Bản đang trên web: </span>{sv.name}</p>}
                  </td>
                  <td className="px-3 py-3">
                    <input className={`input font-medium ${ai ? 'border-amber-400 bg-amber-50' : ''}`} maxLength={300} value={d.name} onChange={(e) => setRow(r.id, { name: e.target.value })} />
                    <p className="mt-0.5 text-right text-[11px] text-zinc-400">{d.name.trim().length} ký tự</p>
                    <textarea className={`input mt-1 min-h-20 text-xs ${ai ? 'border-amber-400 bg-amber-50' : ''}`} maxLength={5000} value={d.desc} onChange={(e) => setRow(r.id, { desc: e.target.value })} />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button type="button" className="btn-primary h-8 px-3 text-xs" disabled={!!b || !!bulk || !d.name.trim() || (!dirty && sv.locked)} onClick={() => save(r.id)}>{b === 'save' ? 'Đang lưu…' : '💾 Lưu + khóa'}</button>
                      <button type="button" className="btn-ghost h-8 border border-zinc-200 px-3 text-xs" disabled={!!b || !!bulk} onClick={() => suggestOne(r.id)}>{b === 'ai' ? 'AI đang dịch…' : '🤖 AI gợi ý từ tên gốc'}</button>
                      {dirty && <button type="button" className="text-xs text-zinc-500 hover:underline" disabled={!!b} onClick={() => { setRow(r.id, { name: sv.name, desc: sv.desc }); setRowMsg(r.id, null); }}>Hoàn tác</button>}
                      {sv.locked && !dirty && <span className="text-xs text-emerald-700">🔒 Đã khóa</span>}
                      {m && <span className={`text-xs ${m.ok ? 'text-emerald-700' : 'text-red-600'}`}>{m.text}</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
