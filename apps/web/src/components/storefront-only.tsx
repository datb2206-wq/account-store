'use client';

import { usePathname } from 'next/navigation';

// Root layout không render lại khi chuyển trang -> ẩn/hiện theo đường dẫn ở client (không hiện trong /admin)
export function StorefrontOnly({ children }: { children: React.ReactNode }) {
  return usePathname().startsWith('/admin') ? null : children;
}
