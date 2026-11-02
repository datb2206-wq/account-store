import { MaintenanceScreen } from '@/components/maintenance-screen';
import { SiteSupport } from '@/components/shop/site-support';
import { SiteHeader } from '@/components/site-header';
import { requireUser } from '@/lib/auth';
import { blockedByMaintenance } from '@/lib/site';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (await blockedByMaintenance(user)) return <MaintenanceScreen />;

  return (
    <div className="min-h-screen">
      <SiteHeader user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <SiteSupport />
    </div>
  );
}
