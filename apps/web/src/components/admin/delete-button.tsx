'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/lib/client-api';

export function DeleteButton({
  url,
  confirmText,
  redirectTo,
  label = 'Xóa',
}: {
  url: string;
  confirmText: string;
  redirectTo: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (!window.confirm(confirmText)) return;
    setPending(true);
    const res = await apiRequest(url, 'DELETE');
    setPending(false);
    if (!res.ok) {
      window.alert(res.data.error ?? 'Xóa thất bại');
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <button type="button" onClick={onClick} disabled={pending} className="btn-ghost text-red-600 hover:bg-red-50 hover:text-red-700">
      {pending ? 'Đang xóa…' : label}
    </button>
  );
}
