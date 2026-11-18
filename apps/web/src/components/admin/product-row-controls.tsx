'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/lib/client-api';

// Công tắc Đang bán / Đã ẩn ngay trên danh sách
export function ProductActiveToggle({ id, active, disabled }: { id: string; active: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(active);
  const [pending, setPending] = useState(false);

  async function toggle() {
    const next = !on;
    setOn(next);
    setPending(true);
    const res = await apiRequest(`/api/admin/products/${id}/order`, 'PATCH', { isActive: next });
    setPending(false);
    if (!res.ok) {
      setOn(!next);
      window.alert(res.data.error ?? 'Không đổi được trạng thái');
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={on ? 'Đang bán, bấm để ẩn' : 'Đang ẩn, bấm để bán'}
      onClick={toggle}
      disabled={disabled || pending}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-60 ${on ? 'bg-indigo-500' : 'bg-zinc-300'}`}
    >
      <span className={`inline-block size-4 rounded-full bg-white shadow transition ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

// Nút thao tác: Kho / Nguồn API, Sửa, Xóa
export function ProductRowActions({ id, name, reseller, supplierId, editable }: { id: string; name: string; reseller: boolean; supplierId: string | null; editable: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function remove() {
    if (!window.confirm(`Xóa sản phẩm "${name}" và hàng chưa bán trong kho? Sản phẩm đã có đơn thì chỉ ẩn được, không xóa được.`)) return;
    setPending(true);
    const res = await apiRequest(`/api/admin/products/${id}`, 'DELETE');
    setPending(false);
    if (!res.ok) return window.alert(res.data.error ?? 'Xóa thất bại');
    router.refresh();
  }

  const btn = 'inline-flex h-7 items-center justify-center rounded-md px-2 text-xs font-medium text-white whitespace-nowrap';
  return (
    <div className="flex items-center gap-1">
      {reseller ? (
        supplierId ? (
          <Link href={`/admin/suppliers/${supplierId}`} className={`${btn} bg-indigo-500 hover:bg-indigo-600`} title="Sản phẩm lấy từ nguồn API">☰ Quản lý API</Link>
        ) : (
          <span className={`${btn} bg-zinc-300`} title="Nguồn API đã bị xóa">☰ API</span>
        )
      ) : (
        <Link href={`/admin/products/${id}/stock`} className={`${btn} bg-indigo-500 hover:bg-indigo-600`}>☰ Kho hàng</Link>
      )}
      <Link href={`/admin/products/${id}`} className={`${btn} w-7 bg-sky-500 hover:bg-sky-600`} title="Sửa" aria-label="Sửa">✎</Link>
      {editable && (
        <button type="button" onClick={remove} disabled={pending} className={`${btn} w-7 bg-red-500 hover:bg-red-600 disabled:opacity-60`} title="Xóa" aria-label="Xóa">
          🗑
        </button>
      )}
    </div>
  );
}
