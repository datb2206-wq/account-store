import Script from 'next/script';
import { getI18n } from '@/i18n/server';
import { getSiteExtras, themeCss } from '@/lib/site-extras';
import { ChatIcon, PhoneIcon } from './icons';
import { SitePopup } from './site-popup';

// Phần chung của mọi trang khách (Admin > Cài đặt website): màu, popup, nút Zalo/Messenger/Hotline, mã theo dõi.
// Không chèn vào trang /admin: mã tùy chỉnh không được chạy trong khu quản trị.
export async function SiteChrome() {
  const [x, { d }] = await Promise.all([getSiteExtras(), getI18n()]);
  const css = themeCss(x);
  const { gaId, fbPixelId, bodyHtml } = x.tracking;
  const contacts = [
    x.widgets.zalo && { href: `https://zalo.me/${x.widgets.zalo}`, label: d.extras.zalo, className: 'bg-[#0068ff]', icon: <span className="text-[11px] font-extrabold">Zalo</span> },
    x.widgets.messenger && { href: `https://m.me/${x.widgets.messenger}`, label: d.extras.messenger, className: 'bg-gradient-to-br from-[#00b2ff] to-[#a033ff]', icon: <ChatIcon size={22} /> },
    x.widgets.hotline && { href: `tel:${x.widgets.hotline}`, label: `${d.extras.hotline} ${x.widgets.hotline}`, className: 'bg-emerald-600', icon: <PhoneIcon size={20} /> },
  ].filter((c) => !!c);

  return (
    <>
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      {x.popup.enabled && (x.popup.title || x.popup.body) && <SitePopup popup={x.popup} />}
      {contacts.length > 0 && (
        <div className="fixed bottom-4 left-4 z-40 flex flex-col gap-2.5 sm:bottom-6 sm:left-6">
          {contacts.map((c) => (
            <a
              key={c.href}
              href={c.href}
              target={c.href.startsWith('tel:') ? undefined : '_blank'}
              rel="noopener noreferrer"
              title={c.label}
              aria-label={c.label}
              className={`grid size-12 place-items-center rounded-full text-white shadow-lg transition hover:scale-105 ${c.className}`}
            >
              {c.icon}
            </a>
          ))}
        </div>
      )}
      {gaId && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(gaId)});`}
          </Script>
        </>
      )}
      {fbPixelId && (
        <Script id="fb-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(fbPixelId)});fbq('track','PageView');`}
        </Script>
      )}
      {/* HTML tùy chỉnh (chat Tawk.to, Crisp…): chỉ super admin sửa được. Script chạy khi tải trang lần đầu. */}
      {bodyHtml.trim() && <div hidden suppressHydrationWarning dangerouslySetInnerHTML={{ __html: bodyHtml }} />}
    </>
  );
}
