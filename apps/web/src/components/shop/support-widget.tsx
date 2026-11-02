'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SUPPORT_OPEN_EVENT } from '@/components/contact-link';
import { BriefcaseIcon, ChatIcon, ChevronIcon, ClockIcon, CloseIcon, MailIcon, MegaphoneIcon, SendIcon, StoreIcon } from '@/components/icons';
import { useI18n } from '@/i18n/client';
import { fmt } from '@/i18n/config';

// Nút hỗ trợ nổi góc phải. Chưa có chat realtime: dẫn khách sang Telegram/Email + FAQ.
// Muốn chat trực tiếp trên web: nhúng dịch vụ như Crisp / Tawk.to thay cho panel này.
const BUBBLE_KEY = 'az_support_bubble';
const BUBBLE_DELAY_MS = 2_500;

type Links = { business: string | null; supplier: string | null; channel: string | null };

export function SupportWidget({ siteName, telegram, email, hours, links }: { siteName: string; telegram: string; email: string; hours: string; links: Links }) {
  const { d } = useI18n();
  const t = d.support;
  const FAQ = [
    { q: t.faq1q, a: t.faq1a },
    { q: t.faq2q, a: t.faq2a },
    { q: t.faq3q, a: t.faq3a },
  ];
  const [open, setOpen] = useState(false);
  const [faq, setFaq] = useState<number | null>(null);
  const [bubble, setBubble] = useState(false);
  const tg = telegram.replace(/^@/, '');
  const extra = [
    { key: 'business', href: links.business, label: d.announce.business, icon: <BriefcaseIcon size={15} /> },
    { key: 'supplier', href: links.supplier, label: d.announce.supplier, icon: <StoreIcon size={15} /> },
    { key: 'channel', href: links.channel, label: d.announce.channel, icon: <MegaphoneIcon size={15} /> },
  ].filter((l): l is typeof l & { href: string } => !!l.href);

  // Nút "Business Inquiries", "Become Supplier"… chưa cấu hình link -> mở widget này
  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setBubble(false);
    };
    window.addEventListener(SUPPORT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(SUPPORT_OPEN_EVENT, onOpen);
  }, []);

  // Bong bóng chào hiện 1 lần mỗi phiên, sau vài giây (không hiện ngay lúc tải trang)
  useEffect(() => {
    try {
      if (sessionStorage.getItem(BUBBLE_KEY)) return;
    } catch {}
    const timer = setTimeout(() => setBubble(true), BUBBLE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const dismissBubble = () => {
    setBubble(false);
    try {
      sessionStorage.setItem(BUBBLE_KEY, '1');
    } catch {}
  };
  const toggle = () => {
    dismissBubble();
    setOpen((o) => !o);
  };

  return (
    <div className="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {open && (
        <div role="dialog" aria-label={t.dialog} className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-900/5">
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-5 text-white">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-semibold">{t.greeting}</p>
                <p className="mt-0.5 text-sm text-blue-100">{fmt(t.help, { site: siteName })}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-blue-100 hover:bg-white/10" aria-label={t.close}>
                <CloseIcon />
              </button>
            </div>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs">
              <span className="size-2 rounded-full bg-emerald-400" /> {t.online} · <ClockIcon size={12} /> {hours}
            </p>
          </div>

          <div className="space-y-2 p-4">
            {tg && (
              <a href={`https://t.me/${tg}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3 transition hover:border-blue-300 hover:bg-blue-50">
                <span className="flex size-9 items-center justify-center rounded-lg bg-sky-500 text-white"><SendIcon size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{t.telegram}</span>
                  <span className="block truncate text-xs text-zinc-500">@{tg} · {t.telegramHint}</span>
                </span>
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3 transition hover:border-blue-300 hover:bg-blue-50">
                <span className="flex size-9 items-center justify-center rounded-lg bg-zinc-800 text-white"><MailIcon size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{t.email}</span>
                  <span className="block truncate text-xs text-zinc-500">{email}</span>
                </span>
              </a>
            )}
            {extra.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {extra.map((l) => (
                  <a
                    key={l.key}
                    href={l.href}
                    target={l.href.startsWith('mailto:') ? undefined : '_blank'}
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-blue-50 hover:text-blue-700"
                  >
                    <span className="text-zinc-400">{l.icon}</span> {l.label}
                  </a>
                ))}
              </div>
            )}
            {!tg && !email && extra.length === 0 && <p className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-500">{t.noContacts}</p>}

            <div className="pt-2">
              <p className="mb-1 px-1 text-xs font-semibold tracking-wide text-zinc-400 uppercase">{t.quickAnswers}</p>
              {FAQ.map((item, i) => (
                <div key={item.q} className="border-b border-zinc-100 last:border-0">
                  <button type="button" onClick={() => setFaq(faq === i ? null : i)} className="flex w-full items-center justify-between gap-2 px-1 py-2.5 text-left text-sm font-medium text-zinc-700">
                    {item.q}
                    <ChevronIcon size={16} className={`shrink-0 text-zinc-400 transition ${faq === i ? 'rotate-180' : ''}`} />
                  </button>
                  {faq === i && <p className="px-1 pb-3 text-sm text-zinc-500">{item.a}</p>}
                </div>
              ))}
            </div>
            <Link href="/dashboard/orders" className="block pt-1 text-center text-xs font-medium text-blue-600 hover:underline">{t.viewOrders}</Link>
          </div>
        </div>
      )}

      {bubble && !open && (
        <div className="relative flex max-w-64 items-center gap-2 rounded-2xl rounded-br-md bg-white py-2.5 pr-2 pl-3.5 text-sm font-medium text-zinc-800 shadow-xl ring-1 ring-zinc-900/5">
          <button type="button" onClick={toggle} className="flex items-center gap-2 text-left">
            <span className="size-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
            {t.bubble}
          </button>
          <button type="button" onClick={dismissBubble} className="rounded-md p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label={t.close}>
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-label={open ? t.close : t.open}
        aria-expanded={open}
        className="group relative flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-lg shadow-blue-500/30 transition hover:scale-105"
      >
        {!open && <span className="absolute inset-0 animate-ping rounded-full bg-blue-500 opacity-20" aria-hidden />}
        {open ? <CloseIcon size={22} /> : <ChatIcon size={24} />}
        {!open && <span className="absolute top-0.5 right-0.5 size-3.5 rounded-full border-2 border-white bg-emerald-400" aria-hidden />}
      </button>
    </div>
  );
}
