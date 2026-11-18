'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/client-api';

// Công tắc bật/tắt kết nối ngay trên bảng
export function SupplierActiveToggle({ supplierId, active, disabled }: { supplierId: string; active: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(active);
  const [pending, setPending] = useState(false);

  async function toggle() {
    const next = !on;
    setOn(next);
    setPending(true);
    const res = await apiRequest(`/api/admin/suppliers/${supplierId}/active`, 'POST', { isActive: next });
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
      aria-label={on ? 'Đang bật, bấm để tắt' : 'Đang tắt, bấm để bật'}
      onClick={toggle}
      disabled={disabled || pending}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-60 ${on ? 'bg-indigo-500' : 'bg-zinc-300'}`}
    >
      <span className={`inline-block size-4 rounded-full bg-white shadow transition ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

// Menu "Thao tác" của 1 dòng
export function SupplierActionsMenu({ supplierId, active, canSync, canEdit }: { supplierId: string; active: boolean; canSync: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  async function sync() {
    setOpen(false);
    setBusy(true);
    const res = await apiRequest<{ workerOnline: boolean }>(`/api/admin/suppliers/${supplierId}/sync`, 'POST');
    setBusy(false);
    if (!res.ok) return window.alert(res.data.error ?? 'Không thể đồng bộ');
    window.alert(res.data.workerOnline ? 'Đã đưa vào hàng đợi đồng bộ. Tải lại trang sau ít phút.' : 'Đã đưa vào hàng đợi nhưng worker đang KHÔNG chạy.');
    router.refresh();
  }

  const item = 'block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50';
  return (
    <div ref={ref} className="relative inline-block text-left">
      <button type="button" onClick={() => setOpen((v) => !v)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-60">
        ⚙ {busy ? 'Đang gửi…' : 'Thao tác'} <span aria-hidden className="text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
          <Link href={`/admin/suppliers/${supplierId}`} className={item}>{canEdit ? '✏️ Chi tiết & cài đặt' : '👁 Xem chi tiết'}</Link>
          {canSync && (
            <button type="button" onClick={sync} disabled={!active} className={`${item} disabled:cursor-not-allowed disabled:text-zinc-300`}>⟳ Đồng bộ ngay</button>
          )}
          <Link href="/admin/products?status=inactive" className={item}>📦 Sản phẩm đang ẩn</Link>
        </div>
      )}
    </div>
  );
}
