'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// Cloudflare Turnstile (captcha miễn phí). Tải script khi cần, render widget, báo token qua onToken.
// ref.reset(): lấy token mới sau mỗi lần gửi form (mỗi token chỉ dùng được 1 lần).
type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<void> | null = null;

function loadScript() {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('captcha script failed'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export interface TurnstileHandle {
  reset: () => void;
}

export const Turnstile = forwardRef<TurnstileHandle, { siteKey: string; onToken: (token: string | null) => void; language?: string }>(
  function Turnstile({ siteKey, onToken, language }, ref) {
    const box = useRef<HTMLDivElement>(null);
    const widget = useRef<string | null>(null);
    const cb = useRef(onToken);
    cb.current = onToken;

    useImperativeHandle(ref, () => ({
      reset: () => {
        cb.current(null);
        if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
      },
    }));

    useEffect(() => {
      let cancelled = false;
      loadScript()
        .then(() => {
          if (cancelled || !box.current || !window.turnstile) return;
          widget.current = window.turnstile.render(box.current, {
            sitekey: siteKey,
            language: language ?? 'auto',
            callback: (t: string) => cb.current(t),
            'expired-callback': () => cb.current(null),
            'error-callback': () => cb.current(null),
          });
        })
        .catch(() => cb.current(null));
      return () => {
        cancelled = true;
        if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
        widget.current = null;
      };
    }, [siteKey, language]);

    return <div ref={box} className="flex min-h-[65px] justify-center" />;
  },
);
