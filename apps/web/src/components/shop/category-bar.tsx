'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronIcon } from '@/components/icons';

// Khung cuộn ngang cho thanh danh mục: nút mũi tên 2 bên (desktop) khi còn nội dung bị khuất,
// tự cuộn tab đang chọn vào giữa tầm nhìn. Điện thoại: vuốt ngang.
export function CategoryBarScroller({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    el.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: 'smooth' });
  const arrow = 'absolute top-1/2 z-10 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white text-zinc-600 shadow-md ring-1 ring-zinc-200 transition hover:text-zinc-900 md:flex';

  return (
    <div className="relative">
      <div ref={ref} role="list" aria-label={label} className="no-scrollbar flex overflow-x-auto scroll-smooth">
        {children}
      </div>
      {edges.left && (
        <>
          <span className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-white" aria-hidden />
          <button type="button" onClick={() => scroll(-1)} className={`${arrow} left-0`} aria-label="←" tabIndex={-1}>
            <ChevronIcon size={16} className="rotate-90" />
          </button>
        </>
      )}
      {edges.right && (
        <>
          <span className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white" aria-hidden />
          <button type="button" onClick={() => scroll(1)} className={`${arrow} right-0`} aria-label="→" tabIndex={-1}>
            <ChevronIcon size={16} className="-rotate-90" />
          </button>
        </>
      )}
    </div>
  );
}
