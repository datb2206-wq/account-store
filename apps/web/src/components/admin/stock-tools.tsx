'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/lib/client-api';
import { FormAlert } from './form-field';

type Status = 'AVAILABLE' | 'INVALID' | 'SOLD';
const STATUS_LABEL: Record<Status, string> = { AVAILABLE: 'Còn hàng', INVALID: 'Vô hiệu', SOLD: 'Đã bán' };

// Xuất TXT / copy / rút hàng ra khỏi kho, và chuyển hàng sang sản phẩm khác
export function StockTools({
  productId,
  batch,
  counts,
  targets,
  canExport,
  canMove,
}: {
  productId: string;
  batch?: string;
  counts: Record<Status, number>;
  targets: { id: string; name: string }[];
  canExport: boolean;
  canMove: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('AVAILABLE');
  const [limit, setLimit] = useState('');
  const [target, setTarget] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const n = limit ? Number(limit) : undefined;
  const scope = `${n ? `${n} ` : 'tất cả '}hàng "${STATUS_LABEL[status]}"${batch ? ` của lô ${batch}` : ''}`;

  async function exportTxt(mode: 'download' | 'copy' | 'remove') {
    if (mode === 'remove' && !window.confirm(`Xuất rồi XÓA ${scope} khỏi kho? Hãy lưu file vừa tải về, hàng đã xóa không khôi phục được.`)) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/admin/stock/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId, status, batch, limit: n, remove: mode === 'remove' }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        return setError(data.error ?? 'Xuất thất bại');
      }
      const text = await res.text();
      const count = Number(res.headers.get('x-count') ?? 0);
      if (count === 0) return setError('Không có hàng nào để xuất');
      if (mode === 'copy') {
        await navigator.clipboard.writeText(text);
        setSuccess(`Đã copy ${count} dòng vào clipboard.`);
      } else {
        const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'stock.txt';
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: name });
        a.click();
        URL.revokeObjectURL(url);
        setSuccess(mode === 'remove' ? `Đã tải ${count} dòng và xóa khỏi kho.` : `Đã tải ${count} dòng.`);
      }
      if (mode === 'remove') router.refresh();
    } catch {
      setError('Không kết nối được máy chủ');
    } finally {
      setPending(false);
    }
  }

  async function move() {
    if (status === 'SOLD') return setError('Không chuyển được hàng đã bán');
    const name = targets.find((t) => t.id === target)?.name;
    if (!name) return setError('Chọn sản phẩm đích');
    if (!window.confirm(`Chuyển ${scope} sang "${name}"?`)) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    const res = await apiRequest<{ moved: number }>('/api/admin/stock/move', 'POST', { productId, targetId: target, status, batch, limit: n });
    setPending(false);
    if (!res.ok) return setError(res.data.error ?? 'Chuyển thất bại');
    setSuccess(`Đã chuyển ${res.data.moved} dòng sang "${name}". Dòng trùng nội dung với hàng có sẵn ở sản phẩm đích được giữ lại.`);
    router.refresh();
  }

  return (
    <section className="card space-y-4">
      <h2 className="font-semibold">Xuất / chuyển kho</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Loại hàng</span>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]} ({counts[s].toLocaleString('en-US')})</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Số lượng</span>
          <input className="input tabular-nums" inputMode="numeric" placeholder="Để trống = tất cả" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ''))} />
        </label>
      </div>
      {batch && <p className="text-xs text-amber-700">Chỉ áp dụng cho lô đang lọc: <span className="font-mono">{batch}</span></p>}

      {canExport && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={pending} onClick={() => exportTxt('download')}>Tải file TXT</button>
          <button type="button" className="btn-ghost border border-zinc-200" disabled={pending} onClick={() => exportTxt('copy')}>Copy</button>
          {status !== 'SOLD' && (
            <button type="button" className="btn-ghost border border-red-200 text-red-600 hover:bg-red-50" disabled={pending} onClick={() => exportTxt('remove')}>Xuất & xóa khỏi kho</button>
          )}
        </div>
      )}

      {canMove && status !== 'SOLD' && (
        <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
          <select className="input min-w-0 flex-1" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Chuyển sang sản phẩm…</option>
            {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button type="button" className="btn-ghost border border-zinc-200" disabled={pending || !target} onClick={move}>Chuyển</button>
        </div>
      )}
      <FormAlert error={error} success={success} />
    </section>
  );
}
