import { LanguageSwitcher } from '@/components/i18n/language-switcher';
import { Logo } from '@/components/logo';
import { getSiteConfig } from '@/lib/site';
import { getSiteAssets } from '@/lib/site-assets';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [site, assets] = await Promise.all([getSiteConfig(), getSiteAssets()]);
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="mb-8"><Logo name={site.name} logoUrl={assets.logo ?? site.logoUrl} /></div>
      <div className="card w-full max-w-sm p-6">{children}</div>
    </main>
  );
}
