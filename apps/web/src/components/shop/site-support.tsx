import { contactHref } from '@/lib/contact';
import { getSiteConfig } from '@/lib/site';
import { SupportWidget } from './support-widget';

// Widget hỗ trợ góc phải, dữ liệu từ Admin > Cấu hình > site.general
export async function SiteSupport() {
  const site = await getSiteConfig();
  return (
    <SupportWidget
      siteName={site.name}
      telegram={site.supportTelegram}
      email={site.supportEmail}
      hours={site.supportHours}
      links={{ business: contactHref(site.businessContact), supplier: contactHref(site.supplierContact), channel: contactHref(site.channelUrl) }}
    />
  );
}
