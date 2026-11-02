'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { ChevronIcon } from '@/components/icons';
import { useI18n } from '@/i18n/client';
import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALE_META, LOCALE_STORAGE_KEY, LOCALES, type Locale } from '@/i18n/config';
import { Flag } from './flag';

function readStored(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null; // chế độ riêng tư / bị chặn storage
  }
}

function persistLocal(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {}
  // Đặt cookie ngay ở client: server render đúng ngôn ngữ kể cả khi request /api/locale lỗi mạng
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}

// dark: đặt trên thanh đen trên cùng
export function LanguageSwitcher({ align = 'right', dark = false }: { align?: 'left' | 'right'; dark?: boolean }) {
  const { locale, d } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  async function choose(next: Locale) {
    setOpen(false);
    if (next === locale) return;
    persistLocal(next);
    // Lưu vào tài khoản nếu đã đăng nhập (server bỏ qua phần này với khách)
    await fetch('/api/locale', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locale: next }) }).catch(() => null);
    startTransition(() => router.refresh());
  }

  // Cookie bị xóa nhưng localStorage còn -> khôi phục lựa chọn cũ; lần đầu thì ghi nhớ ngôn ngữ hiện tại
  useEffect(() => {
    const stored = readStored();
    const hasCookie = document.cookie.split('; ').some((c) => c.startsWith(`${LOCALE_COOKIE}=`));
    if (isLocale(stored) && stored !== locale && !hasCookie) void choose(stored);
    else if (!stored) persistLocal(locale);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={d.common.language}
        title={d.common.language}
        className={`flex items-center gap-1.5 rounded-lg px-2 text-sm font-medium ring-1 transition ${dark ? 'py-1 text-white ring-zinc-700 hover:bg-zinc-800' : 'py-1.5 text-zinc-600 ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-900'} ${pending ? 'opacity-60' : ''}`}
      >
        <Flag locale={locale} />
        <span className="hidden tabular-nums sm:inline">{LOCALE_META[locale].short}</span>
        <ChevronIcon size={14} className={`text-zinc-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={d.common.language}
          className={`absolute top-full z-50 mt-2 w-48 overflow-hidden rounded-xl bg-white p-1 shadow-xl ring-1 ring-zinc-900/10 ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {LOCALES.map((l) => (
            <li key={l} role="option" aria-selected={l === locale}>
              <button
                type="button"
                lang={LOCALE_META[l].htmlLang}
                onClick={() => void choose(l)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${l === locale ? 'bg-blue-50 font-semibold text-blue-700' : 'text-zinc-700 hover:bg-zinc-50'}`}
              >
                <Flag locale={l} />
                <span className="flex-1">{LOCALE_META[l].name}</span>
                {l === locale && <span aria-hidden>✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
