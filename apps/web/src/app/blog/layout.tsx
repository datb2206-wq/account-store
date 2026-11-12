import { MaintenanceScreen } from '@/components/maintenance-screen';
import { SiteSupport } from '@/components/shop/site-support';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getCurrentUser } from '@/lib/auth';
import { blockedByMaintenance } from '@/lib/site';

export default async function BlogLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (await blockedByMaintenance(user)) return <MaintenanceScreen />;
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader user={user} />
      <main className="site-container flex-1 py-8">{children}</main>
      <SiteFooter />
      <SiteSupport />
    </div>
  );
}
