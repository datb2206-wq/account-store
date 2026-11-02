'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Tải lại dữ liệu Server Component định kỳ (VD trang đơn hàng đang chờ web gốc giao)
export function AutoRefresh({ everyMs = 5_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);
  return null;
}
