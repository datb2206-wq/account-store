'use client';

import { useEffect, useState } from 'react';
import { BlogContent } from '@/components/blog-content';
import { CloseIcon } from '@/components/icons';
import { useI18n } from '@/i18n/client';

type Popup = { title: string; body: string; buttonText: string; buttonUrl: string; frequency: 'session' | 'day' | 'always' };

// Khóa theo nội dung: admin sửa popup thì khách đã tắt bản cũ vẫn thấy bản mới
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const today = () => new Date().toISOString().slice(0, 10);

export function SitePopup({ popup }: { popup: Popup }) {
  const { d } = useI18n();
  const [open, setOpen] = useState(false);
  const key = `az_popup_${hash(popup.title + popup.body + popup.buttonUrl)}`;

  useEffect(() => {
    let seen: string | null = null;
    try {
      if (popup.frequency === 'session') seen = sessionStorage.getItem(key);
      if (popup.frequency === 'day') seen = localStorage.getItem(key) === today() ? '1' : null;
    } catch {}
    if (seen) return;
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [key, popup.frequency]);

  const close = () => {
    setOpen(false);
    try {
      if (popup.frequency === 'session') sessionStorage.setItem(key, '1');
      if (popup.frequency === 'day') localStorage.setItem(key, today());
    } catch {}
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open) return null;
  const external = /^https?:\/\//i.test(popup.buttonUrl);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" onClick={close} role="dialog" aria-modal="true" aria-label={popup.title || undefined}>
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={close} aria-label={d.common.close} className="absolute top-3 right-3 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
          <CloseIcon size={18} />
        </button>
        {popup.title && <h2 className="mb-3 pr-8 text-lg font-bold text-zinc-900">{popup.title}</h2>}
        {popup.body && <BlogContent text={popup.body} />}
        <div className="mt-5 flex justify-end gap-2">
          {popup.buttonText && popup.buttonUrl ? (
            <a href={popup.buttonUrl} onClick={close} className="btn-primary" {...(external && { target: '_blank', rel: 'noopener noreferrer' })}>{popup.buttonText}</a>
          ) : (
            <button type="button" onClick={close} className="btn-primary">{d.common.close}</button>
          )}
        </div>
      </div>
    </div>
  );
}
