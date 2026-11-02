'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronIcon, CloseIcon, GridIcon, SearchIcon } from '@/components/icons';
import { useI18n } from '@/i18n/client';
import { fmt, plural } from '@/i18n/config';
import type { MenuColumn, MenuItem } from '@/lib/category-menu';
import { buildHref } from '@/lib/url';
import { CategoryIcon } from './category-icon';

// Mega menu "Select a Category": lưới 4 cột, mỗi ô là 1 danh mục gốc kèm danh mục con.
// Panel đặt absolute theo <header> (sticky) nên luôn rộng hết màn hình ngay dưới thanh header.
export function CategoryMenu({ total, columns }: { total: number; columns: MenuColumn[] }) {
  const { locale, d } = useI18n();
  const t = d.menu;
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [maxHeight, setMaxHeight] = useState<number>();

  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // Header cao thấp khác nhau (thanh thông báo, ô tìm kiếm trên điện thoại) -> đo vị trí thật
    // để đáy bảng menu luôn nằm trong màn hình và cuộn được tới dòng cuối
    const fit = () => setMaxHeight(window.innerHeight - (rootRef.current?.closest('header')?.getBoundingClientRect().bottom ?? 0) - 8);
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('scroll', fit, { passive: true });
    // Chỉ tự focus ô tìm trên desktop: trên điện thoại sẽ bật bàn phím che mất menu
    if (window.matchMedia('(min-width: 768px)').matches) searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(true);
    const onDown = (e: MouseEvent) => !rootRef.current?.contains(e.target as Node) && close();
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', fit);
      window.removeEventListener('scroll', fit);
    };
  }, [open]);

  const needle = q.trim().toLowerCase();
  const hit = (item: MenuItem) => !needle || item.name.toLowerCase().includes(needle) || item.slug.includes(needle);
  const visible = columns
    .map((col) => ({ col, items: hit(col) ? col.items : col.items.filter(hit) }))
    .filter(({ col, items }) => hit(col) || items.length > 0);

  return (
    <div ref={rootRef} className="shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t.selectCategory}
        className={`flex h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-bold whitespace-nowrap text-white shadow-sm transition md:w-56 md:px-4 ${
          open ? 'bg-orange-700' : 'bg-orange-600 hover:bg-orange-700'
        }`}
      >
        <GridIcon size={16} />
        <span className="hidden md:inline">{t.selectCategory}</span>
        <ChevronIcon size={15} className={`ml-auto hidden transition md:block ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Lớp mờ phía dưới header: bấm ra ngoài để đóng */}
      <div
        aria-hidden
        onClick={() => close()}
        className={`absolute inset-x-0 top-full h-screen bg-zinc-900/25 transition-opacity duration-200 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />

      <div
        id={panelId}
        role="dialog"
        aria-label={t.selectCategory}
        className={`absolute inset-x-0 top-full transition duration-200 ease-out ${open ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-2 opacity-0'}`}
      >
        <div className="site-container">
          <div style={{ maxHeight }} className="overflow-y-auto overscroll-contain scroll-smooth rounded-b-2xl border border-t-0 border-zinc-200 bg-white shadow-2xl shadow-zinc-900/10">
            {/* Thanh trên: tìm nhanh + tất cả sản phẩm */}
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-zinc-100 bg-white/95 p-3 backdrop-blur sm:p-4">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-zinc-100 px-3 py-2 ring-blue-500 focus-within:bg-white focus-within:ring-2">
                <SearchIcon size={16} className="shrink-0 text-zinc-400" />
                <input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t.filterPlaceholder}
                  aria-label={t.filterPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
                {q && (
                  <button type="button" onClick={() => setQ('')} className="text-zinc-400 hover:text-zinc-700" aria-label={d.common.close}>
                    <CloseIcon size={14} />
                  </button>
                )}
              </label>
              <Link
                href="/"
                onClick={() => close()}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-blue-700 ring-1 ring-blue-200 transition hover:bg-blue-50"
              >
                <GridIcon size={15} /> {t.allProducts}
                <span className="rounded-md bg-blue-100 px-1.5 text-[11px] tabular-nums">{total.toLocaleString('en-US')}</span>
              </Link>
              <button type="button" onClick={() => close(true)} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 md:hidden" aria-label={d.common.close}>
                <CloseIcon size={18} />
              </button>
            </div>

            {columns.length === 0 ? (
              <p className="p-10 text-center text-sm text-zinc-500">{t.empty}</p>
            ) : visible.length === 0 ? (
              <p className="p-10 text-center text-sm text-zinc-500">{fmt(t.noMatch, { q: q.trim() })}</p>
            ) : (
              <div className="grid grid-cols-1 gap-x-8 gap-y-6 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
                {visible.map(({ col, items }) => (
                  <section key={col.key} className="min-w-0">
                    <Link
                      href={buildHref('/', { category: col.slug })}
                      onClick={() => close()}
                      title={plural(locale, col.count, d.shop.products)}
                      className="flex items-center gap-2.5 border-b-2 border-orange-500 pb-2 text-zinc-900 transition-colors hover:text-orange-600"
                    >
                      <CategoryIcon name={col.name} slug={col.slug} iconUrl={col.iconUrl} size="md" />
                      <span className="min-w-0 flex-1 text-[13px] leading-tight font-extrabold tracking-wide uppercase">{col.name}</span>
                    </Link>
                    {items.length > 0 && (
                      <ul className="mt-1.5">
                        {items.map((item) => (
                          <li key={item.slug}>
                            <Link
                              href={buildHref('/', { category: item.slug })}
                              onClick={() => close()}
                              title={plural(locale, item.count, d.shop.products)}
                              className="flex items-center gap-2 rounded-md px-1 py-1 text-sm text-zinc-600 transition-colors hover:bg-orange-50 hover:text-orange-700"
                            >
                              <span className="min-w-0 flex-1 truncate">{item.name}</span>
                              {item.count > 0 && <span className="text-[11px] text-zinc-400 tabular-nums">{item.count}</span>}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
