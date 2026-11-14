'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/lib/client-api';

// Nút "Phân quyền" ở trang Thành viên: chọn khách thường / nhân viên (kèm vai trò)
export function UserRoleButton({
  id,
  email,
  role,
  adminRoleId,
  roles,
}: {
  id: string;
  email: string;
  role: 'USER' | 'STAFF';
  adminRoleId: string | null;
  roles: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(role === 'USER' ? 'USER' : (adminRoleId ?? 'STAFF'));
  const [pending, setPending] = useState(false);

  async function save() {
    const body = value === 'USER' ? { role: 'USER' } : { role: 'STAFF', adminRoleId: value === 'STAFF' ? null : value };
    if (value !== 'USER' && !window.confirm(`Cấp quyền quản trị cho ${email}?`)) return;
    setPending(true);
    const res = await apiRequest(`/api/admin/users/${id}/role`, 'PATCH', body);
    setPending(false);
    if (!res.ok) {
      window.alert(res.data.error ?? 'Lưu thất bại');
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className="btn-ghost text-xs text-violet-700" onClick={() => setOpen(true)}>
        Phân quyền
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <select className="input h-8 w-44 py-0 text-xs" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Vai trò">
        <option value="USER">Khách thường</option>
        <option value="STAFF">Nhân viên (quyền mặc định)</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>Nhân viên: {r.name}</option>
        ))}
      </select>
      <button type="button" className="btn-primary h-8 px-3 text-xs" disabled={pending} onClick={save}>Lưu</button>
      <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => setOpen(false)}>Hủy</button>
    </span>
  );
}
