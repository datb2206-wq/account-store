'use client';

export const SUPPORT_OPEN_EVENT = 'support:open';

// Link liên hệ: có href thì mở tab mới (Telegram / mailto / URL),
// chưa cấu hình thì mở widget hỗ trợ ở góc phải.
export function ContactLink({ href, className, title, children }: { href: string | null; className?: string; title?: string; children: React.ReactNode }) {
  if (href) {
    return (
      <a href={href} target={href.startsWith('mailto:') ? undefined : '_blank'} rel="noreferrer" className={className} title={title}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(SUPPORT_OPEN_EVENT))} className={className} title={title}>
      {children}
    </button>
  );
}
