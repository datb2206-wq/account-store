'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogoutIcon } from './icons';

// compact: trên màn hình nhỏ chỉ hiện icon (header điện thoại không đủ chỗ cho chữ)
export function LogoutButton({ label = 'Sign out', compact = false }: { label?: string; compact?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    router.replace('/login');
    router.refresh();
  }

  return (
    <button type="button" onClick={logout} disabled={pending} className="btn-ghost" aria-label={label} title={compact ? label : undefined}>
      {compact ? (
        <>
          <LogoutIcon size={17} className="sm:hidden" />
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        label
      )}
    </button>
  );
}
