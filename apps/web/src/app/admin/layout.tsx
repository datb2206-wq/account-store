import Link from 'next/link';
import { prisma } from '@accszone/database';
import { Badge } from '@/components/badge';
import { LogoutButton } from '@/components/logout-button';
import { NavLink } from '@/components/nav-link';
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
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-200 bg-white p-4 md:flex">
        <Link href="/admin" className="mb-6 px-3 text-lg font-bold tracking-tight">
          {site.name} <span className="text-xs font-medium text-blue-600">Admin</span>
        </Link>
        <nav className="space-y-1">
          <NavLink href="/admin" exact>Tổng quan</NavLink>
          <NavLink href="/admin/users">Người dùng</NavLink>
          <NavLink href="/admin/categories">Danh mục</NavLink>
          <NavLink href="/admin/products">Sản phẩm &amp; Kho</NavLink>
          <NavLink href="/admin/orders">
            Đơn hàng
            {stuckOrders > 0 && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{stuckOrders}</span>}
          </NavLink>
          <NavLink href="/admin/transactions">
            Giao dịch &amp; Nạp tiền
            {pendingDeposits > 0 && <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{pendingDeposits}</span>}
          </NavLink>
          <NavLink href="/admin/suppliers">Nhà cung cấp</NavLink>
          {user.role === 'SUPER_ADMIN' && <NavLink href="/admin/translations">Bản dịch</NavLink>}
          {user.role === 'SUPER_ADMIN' && <NavLink href="/admin/settings">Cấu hình</NavLink>}
        </nav>
        <div className="mt-auto space-y-2 border-t border-zinc-100 pt-4">
          <div className="px-3">
            <p className="truncate text-sm font-medium">{user.email}</p>
            <Badge value={user.role} />
          </div>
          <Link href="/dashboard" className="btn-ghost w-full justify-start">← Trang người dùng</Link>
          <LogoutButton label="Đăng xuất" />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}
