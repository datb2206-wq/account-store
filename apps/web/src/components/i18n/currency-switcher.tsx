'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { ChevronIcon } from '@/components/icons';
import { useI18n } from '@/i18n/client';

const COOKIE = 'az_currency'; // trùng CURRENCY_COOKIE ở lib/fx.ts (file đó chỉ chạy phía server)
const MAX_AGE = 365 * 24 * 3600;

// Chọn tiền tệ hiển thị giá quy đổi "≈ ...". Thanh toán vẫn bằng USD.
export function CurrencySwitcher({ options, dark = false }: { options: { code: string; name: string }[]; dark?: boolean }) {
  const { fx } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const current = fx?.currency ?? 'USD';

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

  if (options.length < 2) return null; // chỉ có USD -> không cần ô chọn

  function choose(code: string) {
    setOpen(false);
    if (code === current) return;
    document.cookie = `${COOKIE}=${code}; path=/; max-age=${MAX_AGE}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div ref={rootRef} className="relative" translate="no">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Currency"
        className={`inline-flex h-8 items-center gap-1 rounded-md px-2 font-semibold transition ${dark ? 'text-white hover:bg-white/10' : 'text-zinc-700 hover:bg-zinc-100'} ${pending ? 'opacity-60' : ''}`}
      >
        {current}
        <ChevronIcon size={13} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul role="listbox" className="absolute right-0 z-50 mt-1 max-h-72 w-52 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 text-sm text-zinc-800 shadow-lg">
          {options.map((o) => (
            <li key={o.code}>
              <button
                type="button"
                role="option"
                aria-selected={o.code === current}
                onClick={() => choose(o.code)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50 ${o.code === current ? 'font-semibold text-blue-600' : ''}`}
              >
                <span className="w-10 font-mono text-xs">{o.code}</span>
                <span className="truncate">{o.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
