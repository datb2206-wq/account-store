import Link from 'next/link';
import { getI18n } from '@/i18n/server';
import { contactHref } from '@/lib/contact';
import { getSiteConfig } from '@/lib/site';
import { ContactLink } from './contact-link';
import { BoltIcon, ShieldIcon, WalletIcon } from './icons';

export async function SiteFooter() {
  const [site, { d }] = await Promise.all([getSiteConfig(), getI18n()]);
  const f = d.footer;
  return (
    <footer className="mt-12 bg-zinc-950 text-zinc-400">
      <div className="site-container grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <p className="text-lg font-bold text-white">{site.name}</p>
          <p className="text-sm">{f.tagline}</p>
        </div>
        {[
          { icon: <BoltIcon size={18} />, title: f.instantTitle, text: f.instantText },
          { icon: <ShieldIcon size={18} />, title: f.warrantyTitle, text: f.warrantyText },
          { icon: <WalletIcon size={18} />, title: f.topupTitle, text: f.topupText },
        ].map((item) => (
          <div key={item.title} className="flex gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-orange-600 text-white">{item.icon}</span>
            <div>
              <p className="text-sm font-semibold text-white">{item.title}</p>
              <p className="text-sm">{item.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-zinc-800">
        <div className="site-container flex flex-wrap items-center justify-between gap-2 py-4 text-xs">
          <span>© {new Date().getFullYear()} {site.name}</span>
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/dashboard/orders" className="hover:text-white">{f.myOrders}</Link>
            <Link href="/dashboard/deposit" className="hover:text-white">{f.topUp}</Link>
            <ContactLink href={contactHref(site.resellerApiUrl)} className="hover:text-white">{d.header.resellerApi}</ContactLink>
            <ContactLink href={contactHref(site.supplierContact)} className="hover:text-white">{d.header.becomeSupplier}</ContactLink>
          </span>
        </div>
      </div>
    </footer>
  );
}
