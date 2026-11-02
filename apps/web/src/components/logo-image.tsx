'use client';

import { useEffect, useRef, useState } from 'react';

// Ảnh logo tùy chỉnh, tự chuyển sang logo mặc định nếu ảnh không tải được (sai đường dẫn, 404…).
// Server và lần render đầu ở client luôn ra cùng một <img> -> không lệch hydration;
// chỉ đổi sang fallback sau khi trình duyệt báo lỗi.
export function LogoImage({ src, alt, fallback }: { src: string; alt: string; fallback: React.ReactNode }) {
  const ref = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);

  // Ảnh có thể lỗi TRƯỚC khi React hydrate (onError lúc đó chưa gắn) -> kiểm tra lại sau khi mount
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);

  if (failed) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={src} alt={alt} onError={() => setFailed(true)} height={36} fetchPriority="high" className="h-9 w-auto max-w-44 object-contain" />;
}
