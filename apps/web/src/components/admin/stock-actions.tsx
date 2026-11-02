'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/lib/client-api';
import { Badge } from '@/components/badge';

type Action = 'invalidate' | 'restore' | 'delete';

const ACTION_LABEL: Record<Action, string> = {
  invalidate: 'Vô hiệu hóa',
  restore: 'Khôi phục',
  delete: 'Xóa',
};

function useStockAction(productId: string) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run(action: Action, target: { ids: string[] } | { batch: string }, confirmText: string) {
    if (!window.confirm(confirmText)) return false;
    setPending(true);
    const res = await apiRequest<{ count: number }>('/api/admin/stock', 'POST', { productId, action, ...target });
    setPending(false);
    if (!res.ok) {
      window.alert(res.data.error ?? 'Thao tác thất bại');
      return false;
    }
    window.alert(`${ACTION_LABEL[action]}: ${res.data.count} dòng`);
    router.refresh();
    return true;
  }

  return { pending, run };
}

// Nút thao tác cho cả 1 lô nhập (rollback lô lỗi)
export function BatchActions({ productId, batch, available, invalid }: { productId: string; batch: string; available: number; invalid: number }) {
  const { pending, run } = useStockAction(productId);
  return (
    <div className="flex justify-end gap-1">
      {available > 0 && (
        <button className="btn-ghost px-2 py-1 text-xs" disabled={pending}
          onClick={() => run('invalidate', { batch }, `Vô hiệu hóa ${available} hàng chưa bán của lô ${batch}?`)}>
          Vô hiệu hóa
        </button>
      )}
      {invalid > 0 && (
        <button className="btn-ghost px-2 py-1 text-xs" disabled={pending}
          onClick={() => run('restore', { batch }, `Khôi phục ${invalid} hàng đã vô hiệu của lô ${batch}?`)}>
          Khôi phục
        </button>
      )}
      {available + invalid > 0 && (
        <button className="btn-ghost px-2 py-1 text-xs text-red-600 hover:bg-red-50" disabled={pending}
          onClick={() => run('delete', { batch }, `Xóa vĩnh viễn ${available + invalid} hàng CHƯA BÁN của lô ${batch}? Hàng đã bán được giữ lại.`)}>
          Xóa
        </button>
      )}
    </div>
  );
}

export interface StockRow {
  id: string;
  status: string;
  importBatch: string | null;
  createdAt: string;
  soldAt: string | null;
  orderCode: string | null;
}

export function StockTable({ productId, items, canReveal }: { productId: string; items: StockRow[]; canReveal: boolean }) {
  const { pending, run } = useStockAction(productId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  // Hàng đã gắn với đơn (kể cả INVALID do đổi bảo hành) không thao tác hàng loạt được
  const canSelect = (i: StockRow) => !i.orderCode && (i.status === 'AVAILABLE' || i.status === 'INVALID');
  const selectable = items.filter(canSelect);
  const allSelected = selectable.length > 0 && selectable.every((i) => selected.has(i.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function bulk(action: Action) {
    const ids = [...selected];
    const ok = await run(action, { ids }, `${ACTION_LABEL[action]} ${ids.length} dòng đã chọn?`);
    if (ok) setSelected(new Set());
  }

  async function reveal(id: string) {
    if (revealed[id] !== undefined) {
      setRevealed(({ [id]: _, ...rest }) => rest);
      return;
    }
    const res = await apiRequest<{ content: string }>(`/api/admin/stock/${id}/reveal`, 'POST');
    if (!res.ok) {
      window.alert(res.data.error ?? 'Không xem được');
      return;
    }
    setRevealed((r) => ({ ...r, [id]: res.data.content }));
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm">
          <span className="font-medium text-blue-700">Đã chọn {selected.size}</span>
          <button className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => bulk('invalidate')}>Vô hiệu hóa</button>
          <button className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => bulk('restore')}>Khôi phục</button>
          <button className="btn-ghost px-2 py-1 text-xs text-red-600 hover:bg-red-50" disabled={pending} onClick={() => bulk('delete')}>Xóa</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả"
                  checked={allSelected}
                  disabled={selectable.length === 0}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((i) => i.id)))}
                />
              </th>
              <th>ID</th><th>Trạng thái</th><th>Lô</th><th>Ngày nhập</th><th>Đơn hàng</th>
              {canReveal && <th className="text-right">Nội dung</th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={canReveal ? 7 : 6} className="py-10 text-center text-zinc-500">Không có hàng nào.</td></tr>
            )}
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Chọn ${item.id}`}
                    checked={selected.has(item.id)}
                    disabled={!canSelect(item)}
                    onChange={() => toggle(item.id)}
                  />
                </td>
                <td className="font-mono text-xs text-zinc-500">{item.id}</td>
                <td><Badge value={item.status} tone={item.status === 'AVAILABLE' ? 'green' : item.status === 'SOLD' ? 'blue' : undefined} /></td>
                <td className="font-mono text-xs">{item.importBatch ?? '—'}</td>
                <td className="text-zinc-500">{item.createdAt}</td>
                <td className="font-mono text-xs">{item.orderCode ?? '—'}</td>
                {canReveal && (
                  <td className="text-right">
                    {revealed[item.id] !== undefined && (
                      <code className="mr-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs break-all">{revealed[item.id]}</code>
                    )}
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => reveal(item.id)}>
                      {revealed[item.id] !== undefined ? 'Ẩn' : 'Xem'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
