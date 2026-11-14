'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useState } from 'react';
import { apiRequest } from '@/lib/client-api';
import type { ProductFilter } from '@/lib/admin-products';

type Ctx = { ids: string[]; selected: Set<string>; toggle: (id: string) => void; setAll: (on: boolean) => void };
const BulkContext = createContext<Ctx | null>(null);
const useBulk = () => useContext(BulkContext)!;

// Chọn nhiều sản phẩm trên trang danh sách Admin để bật/ẩn/chuyển danh mục/xóa cùng lúc
export function ProductBulkProvider({ ids, children }: { ids: string[]; children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setAll = (on: boolean) => setSelected(on ? new Set(ids) : new Set());
  return <BulkContext.Provider value={{ ids, selected, toggle, setAll }}>{children}</BulkContext.Provider>;
}

export function BulkCheckbox({ id }: { id: string }) {
  const { selected, toggle } = useBulk();
  return <input type="checkbox" aria-label="Chọn" checked={selected.has(id)} onChange={() => toggle(id)} />;
}

export function BulkAllCheckbox() {
  const { ids, selected, setAll } = useBulk();
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  return <input type="checkbox" aria-label="Chọn tất cả" checked={all} disabled={ids.length === 0} onChange={() => setAll(!all)} />;
}

type Action = 'enable' | 'disable' | 'delete' | 'category' | 'feature' | 'unfeature' | 'order';
const LABEL: Record<Action, string> = {
  enable: 'Bật bán',
  disable: 'Ẩn',
  delete: 'Xóa',
  category: 'Chuyển danh mục',
  feature: 'Ghim nổi bật',
  unfeature: 'Bỏ ghim',
  order: 'Đặt thứ tự',
};

// Ô thứ tự + nút ghim / lên đầu / xuống cuối trên từng dòng sản phẩm
export function ProductOrderControl({ id, sortOrder, isFeatured }: { id: string; sortOrder: number; isFeatured: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(String(sortOrder));
  const [pending, setPending] = useState(false);
  async function patch(body: object) {
    setPending(true);
    const res = await apiRequest<{ sortOrder: number }>(`/api/admin/products/${id}/order`, 'PATCH', body);
    setPending(false);
    if (!res.ok) return window.alert(res.data.error ?? 'Lưu thất bại');
    setValue(String(res.data.sortOrder));
    router.refresh();
  }
  const commit = () => {
    const n = Number(value);
    if (!Number.isInteger(n)) return setValue(String(sortOrder));
    if (n !== sortOrder) void patch({ sortOrder: n });
  };
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" disabled={pending} title={isFeatured ? 'Bỏ ghim nổi bật' : 'Ghim nổi bật'} onClick={() => patch({ isFeatured: !isFeatured })} className={`rounded px-1 text-base leading-none ${isFeatured ? '' : 'opacity-25 grayscale hover:opacity-70'}`}>📌</button>
      <input
        aria-label="Thứ tự"
        className="input h-7 w-16 px-1.5 py-0 text-center text-xs tabular-nums"
        inputMode="numeric"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value.replace(/[^\d-]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      />
      <button type="button" disabled={pending} title="Lên đầu danh mục" onClick={() => patch({ move: 'top' })} className="rounded px-1 text-xs text-zinc-500 hover:bg-zinc-100">▲</button>
      <button type="button" disabled={pending} title="Xuống cuối danh mục" onClick={() => patch({ move: 'bottom' })} className="rounded px-1 text-xs text-zinc-500 hover:bg-zinc-100">▼</button>
    </span>
  );
}

export function ProductBulkBar({ total, filter, categories }: { total: number; filter: ProductFilter; categories: { id: string; label: string }[] }) {
  const router = useRouter();
  const { ids, selected, setAll } = useBulk();
  const [everything, setEverything] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [pending, setPending] = useState(false);
  const pageAll = ids.length > 0 && ids.every((id) => selected.has(id));
  const n = everything ? total : selected.size;
  if (selected.size === 0) return null;

  // Tạo lượt dịch cho các sản phẩm đã chọn (worker dịch dần, xem tiến độ ở Admin > Dịch sản phẩm)
  async function translate() {
    if (!window.confirm(`Dịch ${n.toLocaleString('en-US')} sản phẩm sang các ngôn ngữ đã bật?`)) return;
    const overwrite = window.confirm('Dịch LẠI cả sản phẩm đã có bản dịch?\nOK = dịch lại (thay tên đã sửa) · Cancel = chỉ dịch sản phẩm chưa có bản dịch');
    setPending(true);
    const res = await apiRequest<{ total: number }>('/api/admin/translate/start', 'POST', { ...(everything ? { filter } : { ids: [...selected] }), overwrite });
    setPending(false);
    if (!res.ok) return window.alert(res.data.error ?? 'Không bắt đầu được');
    if (window.confirm(`Đã tạo lượt dịch ${res.data.total} sản phẩm. Mở trang tiến độ?`)) router.push('/admin/translate');
    setAll(false);
    setEverything(false);
  }

  async function run(action: Action) {
    if (action === 'category' && !categoryId) return window.alert('Chọn danh mục đích');
    let sortOrder: number | undefined;
    if (action === 'order') {
      const v = window.prompt('Số thứ tự cho các sản phẩm đã chọn (nhỏ hiển thị trước):', '0');
      if (v === null) return;
      sortOrder = Number(v);
      if (!Number.isInteger(sortOrder)) return window.alert('Nhập số nguyên');
    }
    const extra = action === 'delete' ? '\nSản phẩm đã có đơn hàng sẽ được giữ lại (chỉ ẩn được). Hàng trong kho của sản phẩm bị xóa cũng bị xóa theo.' : '';
    if (!window.confirm(`${LABEL[action]} ${n.toLocaleString('en-US')} sản phẩm?${extra}`)) return;
    setPending(true);
    const res = await apiRequest<{ count: number; skipped: number }>('/api/admin/products/bulk', 'POST', {
      action,
      ...(everything ? { filter } : { ids: [...selected] }),
      ...(action === 'category' && { categoryId }),
      ...(action === 'order' && { sortOrder }),
    });
    setPending(false);
    if (!res.ok) return window.alert(res.data.error ?? 'Thao tác thất bại');
    window.alert(`${LABEL[action]}: ${res.data.count} sản phẩm${res.data.skipped ? ` (bỏ qua ${res.data.skipped} sản phẩm đã có đơn hàng)` : ''}`);
    setAll(false);
    setEverything(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm">
      <span className="font-medium text-blue-700">Đã chọn {n.toLocaleString('en-US')}</span>
      {pageAll && total > ids.length && (
        <button type="button" className="text-xs text-blue-700 underline" onClick={() => setEverything((v) => !v)}>
          {everything ? 'Chỉ chọn trang này' : `Chọn tất cả ${total.toLocaleString('en-US')} sản phẩm theo bộ lọc`}
        </button>
      )}
      <span className="mx-1 h-4 w-px bg-blue-200" />
      <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => run('enable')}>Bật bán</button>
      <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => run('disable')}>Ẩn</button>
      <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => run('feature')}>📌 Ghim</button>
      <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => run('unfeature')}>Bỏ ghim</button>
      <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => run('order')}>Đặt thứ tự</button>
      <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={translate}>🌐 Dịch</button>
      <select className="input h-7 w-52 py-0 text-xs" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">Chuyển sang danh mục…</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={pending || !categoryId} onClick={() => run('category')}>Chuyển</button>
      <button type="button" className="btn-ghost px-2 py-1 text-xs text-red-600 hover:bg-red-50" disabled={pending} onClick={() => run('delete')}>Xóa</button>
    </div>
  );
}
