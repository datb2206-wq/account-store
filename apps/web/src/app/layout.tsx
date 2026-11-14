import type { Metadata } from 'next';
import { I18nProvider } from '@/i18n/client';
import { LOCALE_META } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { getSiteConfig, getSiteUrl } from '@/lib/site';
import { getSiteAssets } from '@/lib/site-assets';
import './globals.css';

// Tên website lấy từ Admin > Cấu hình > site.general
export async function generateMetadata(): Promise<Metadata> {
  const [{ name }, { locale, d }, url, assets] = await Promise.all([getSiteConfig(), getI18n(), getSiteUrl(), getSiteAssets()]);
  return {
    metadataBase: new URL(url),
    title: { default: name, template: `%s · ${name}` },
    description: d.meta.description,
    openGraph: {
      type: 'website',
      siteName: name,
      title: name,
      description: d.meta.description,
      locale: LOCALE_META[locale].htmlLang.replace('-', '_'),
      ...(assets.ogImage && { images: [{ url: assets.ogImage, width: 1200, height: 630 }] }),
    },
    // Favicon admin tải lên (Admin > Giao diện), không có thì dùng public/icon.svg
    icons: assets.favicon ? { icon: assets.favicon, shortcut: assets.favicon, apple: assets.favicon } : { icon: '/icon.svg' },
  };
}

// Google Dịch / Chrome dịch trang thay các text node bằng <font>. Khi React gỡ hoặc chèn cạnh node cũ
// (VD bấm Pay đổi chữ trên nút) sẽ ném NotFoundError và cả trang rơi vào "Đã xảy ra lỗi".
// Bỏ qua thao tác trên node không còn là con trực tiếp (cách xử lý trong facebook/react#11538).
const TRANSLATE_GUARD = `(function(){if(typeof Node!=='function'||!Node.prototype)return;
var r=Node.prototype.removeChild;Node.prototype.removeChild=function(c){if(c.parentNode!==this)return c;return r.apply(this,arguments)};
var i=Node.prototype.insertBefore;Node.prototype.insertBefore=function(n,ref){if(ref&&ref.parentNode!==this)return n;return i.apply(this,arguments)}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, d, fx } = await getI18n();
  return (
    <html lang={LOCALE_META[locale].htmlLang}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TRANSLATE_GUARD }} />
      </head>
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        <I18nProvider locale={locale} dictionary={d} fx={fx}>{children}</I18nProvider>
      </body>
    </html>
  );
}
