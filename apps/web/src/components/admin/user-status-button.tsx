'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/lib/client-api';

export function UserStatusButton({ id, email, banned }: { id: string; email: string; banned: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (!window.confirm(`${banned ? 'Mở khóa' : 'Khóa'} tài khoản ${email}?`)) return;
    setPending(true);
    const res = await apiRequest(`/api/admin/users/${id}/status`, 'PATCH', { status: banned ? 'ACTIVE' : 'BANNED' });
    setPending(false);
    if (!res.ok) window.alert(res.data.error ?? 'Thao tác thất bại');
    else router.refresh();
  }

  return (
    <button type="button" onClick={toggle} disabled={pending} className={`btn-ghost text-xs ${banned ? '' : 'text-red-600 hover:bg-red-50'}`}>
      {banned ? 'Mở khóa' : 'Khóa'}
    </button>
  );
}
