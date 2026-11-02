import type { Metadata } from 'next';
import { I18nProvider } from '@/i18n/client';
import { LOCALE_META } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { getSiteConfig, getSiteUrl } from '@/lib/site';
import './globals.css';

// Tên website lấy từ Admin > Cấu hình > site.general
export async function generateMetadata(): Promise<Metadata> {
  const [{ name }, { locale, d }, url] = await Promise.all([getSiteConfig(), getI18n(), getSiteUrl()]);
  return {
    metadataBase: new URL(url),
    title: { default: name, template: `%s · ${name}` },
    description: d.meta.description,
    openGraph: { type: 'website', siteName: name, title: name, description: d.meta.description, locale: LOCALE_META[locale].htmlLang.replace('-', '_') },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, d, fx } = await getI18n();
  return (
    <html lang={LOCALE_META[locale].htmlLang}>
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        <I18nProvider locale={locale} dictionary={d} fx={fx}>{children}</I18nProvider>
      </body>
    </html>
  );
}
