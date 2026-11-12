import { prisma } from '@accszone/database';
import { AdminShell } from '@/components/admin/admin-shell';
import { requireStaff } from '@/lib/auth';
import { getSiteConfig } from '@/lib/site';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const site = await getSiteConfig();
  const [pendingDeposits, stuckOrders] = await Promise.all([
    prisma.transaction.count({ where: { type: 'DEPOSIT', status: 'PENDING' } }),
    // Đơn RESELLER PENDING quá 5 phút (cùng ngưỡng với bộ lọc "kẹt" ở trang Đơn hàng)
    prisma.order.count({ where: { status: 'PENDING', supplierId: { not: null }, createdAt: { lt: new Date(Date.now() - 5 * 60_000) } } }),
  ]);

  return (
    <AdminShell siteName={site.name} email={user.email} role={user.role} pendingDeposits={pendingDeposits} stuckOrders={stuckOrders}>
      {children}
    </AdminShell>
  );
}
