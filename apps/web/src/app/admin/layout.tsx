import { prisma } from '@accszone/database';
import { AdminShell } from '@/components/admin/admin-shell';
import { requireStaff } from '@/lib/auth';
import { getSiteConfig } from '@/lib/site';
import { getSiteAssets } from '@/lib/site-assets';
import { ALL_PERMISSIONS, can } from '@/lib/permissions';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const [site, assets] = await Promise.all([getSiteConfig(), getSiteAssets()]);
  const [pendingDeposits, stuckOrders] = await Promise.all([
    prisma.transaction.count({ where: { type: 'DEPOSIT', status: 'PENDING' } }),
    // Đơn RESELLER PENDING quá 5 phút (cùng ngưỡng với bộ lọc "kẹt" ở trang Đơn hàng)
    prisma.order.count({ where: { status: 'PENDING', supplierId: { not: null }, createdAt: { lt: new Date(Date.now() - 5 * 60_000) } } }),
  ]);

  return (
    <AdminShell siteName={site.name} email={user.email} role={user.role} pendingDeposits={pendingDeposits} stuckOrders={stuckOrders} permissions={ALL_PERMISSIONS.filter((p) => can(user, p))}
      roleName={user.adminRole?.name}
      logoDarkUrl={assets.logoDark} avatarUrl={assets.avatar}>
      {children}
    </AdminShell>
  );
}
