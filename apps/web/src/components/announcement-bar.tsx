import { getI18n } from '@/i18n/server';
import { contactHref } from '@/lib/contact';
import { getCurrencyOptions } from '@/lib/fx';
import { getSiteConfig } from '@/lib/site';
import { ContactLink } from './contact-link';
import { CurrencySwitcher } from './i18n/currency-switcher';
import { LanguageSwitcher } from './i18n/language-switcher';
import { BriefcaseIcon, MegaphoneIcon, StoreIcon } from './icons';

// Thanh đen trên cùng: liên hệ (trái) + chọn tiền tệ & ngôn ngữ (phải).
// Liên hệ lấy từ Admin > Cấu hình > site.general; mục chưa cấu hình sẽ mở widget hỗ trợ.
export async function AnnouncementBar() {
  const [site, { d }, currencies] = await Promise.all([getSiteConfig(), getI18n(), getCurrencyOptions()]);
  const t = d.announce;
  const items = [
    { key: 'business', icon: <BriefcaseIcon size={14} />, label: t.business, href: contactHref(site.businessContact) ?? contactHref(site.supportTelegram), tone: 'text-white hover:text-amber-300' },
    { key: 'supplier', icon: <StoreIcon size={14} />, label: t.supplier, href: contactHref(site.supplierContact) ?? contactHref(site.supportTelegram), tone: 'text-white hover:text-amber-300' },
    { key: 'channel', icon: <MegaphoneIcon size={14} />, label: t.channel, href: contactHref(site.channelUrl), tone: 'text-amber-400 hover:text-amber-300' },
  ];

  return (
    <div role="region" aria-label={t.label} className="relative z-40 bg-black text-[13px]">
      <div className="site-container flex h-10 items-center justify-between gap-4">
        <ul className="no-scrollbar flex min-w-0 items-center divide-x divide-zinc-700 overflow-x-auto whitespace-nowrap">
          {items.map((it) => (
            <li key={it.key} className="px-3 first:pl-0">
              <ContactLink href={it.href} className={`inline-flex items-center gap-1.5 font-medium transition-colors ${it.tone}`}>
                {it.icon}
                {it.label}
              </ContactLink>
            </li>
          ))}
        </ul>
        <div className="flex shrink-0 items-center gap-1">
          <CurrencySwitcher options={currencies} dark />
          <LanguageSwitcher dark />
        </div>
      </div>
    </div>
  );
}
