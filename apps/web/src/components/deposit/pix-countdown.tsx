'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

// Đếm ngược thời gian còn lại của mã PIX + thanh thời gian. Hết giờ thì tải lại trang (server chuyển lệnh sang hết hạn).
export function PixCountdown({ startAt, expiresAt, label, expiredLabel, accent = '#32BCAD', accentDark = '#1f8f84' }: { startAt: string; expiresAt: string; label: string; expiredLabel: string; accent?: string; accentDark?: string }) {
  const router = useRouter();
  const start = new Date(startAt).getTime();
  const end = new Date(expiresAt).getTime();
  const [now, setNow] = useState<number | null>(null);
  const refreshed = useRef(false);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const left = now === null ? end - start : Math.max(0, end - now);
  useEffect(() => {
    if (now !== null && left === 0 && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [now, left, router]);

  const total = Math.max(1, end - start);
  const pct = Math.min(100, Math.max(0, (left / total) * 100));
  const sec = Math.floor(left / 1000);
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  const tone = sec <= 60 ? 'red' : sec <= 300 ? 'amber' : 'teal';
  const color = { red: 'text-red-600', amber: 'text-amber-600', teal: '' }[tone];
  const bar = { red: 'bg-red-500', amber: 'bg-amber-500', teal: '' }[tone];

  return (
    <div className="space-y-2 px-5 py-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        {left > 0 ? (
          <>
            <span className="flex items-center gap-1.5 text-zinc-500">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" strokeLinecap="round" />
              </svg>
              {label}
            </span>
            <span className={`font-mono text-lg font-bold tabular-nums ${color}`} style={tone === 'teal' ? { color: accentDark } : undefined} aria-live="off">
              {mm}:{ss}
            </span>
          </>
        ) : (
          <span className="font-medium text-red-600">{expiredLabel}</span>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${bar}`} style={{ width: `${pct}%`, ...(tone === 'teal' && { background: accent }) }} />
      </div>
    </div>
  );
}

// Nút copy to cho mã PIX Copia e Cola
export function PixCopyButton({ value, label, copiedLabel, colors = 'bg-[#32BCAD] hover:bg-[#2aa497]' }: { value: string; label: string; copiedLabel: string; colors?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition ${copied ? 'bg-emerald-600' : `${colors} active:scale-[0.99]`}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt(label, value);
        }
      }}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {copied ? <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" /> : <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>}
      </svg>
      {copied ? copiedLabel : label}
    </button>
  );
}
