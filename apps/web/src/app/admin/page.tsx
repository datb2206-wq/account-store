import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { Badge } from '@/components/badge';
import { StatCard } from '@/components/stat-card';
import { requireStaff } from '@/lib/auth';
import { formatDate, formatUsd } from '@/lib/format';

export const metadata: Metadata = { title: 'Admin' };

export default async function AdminOverviewPage() {
  await requireStaff();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [users, newUsersToday, balances, ordersToday, revenue, pendingDeposits, recentUsers] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.user.aggregate({ _sum: { balance: true } }),
    prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.order.aggregate({ where: { status: 'COMPLETED' }, _sum: { totalAmount: true } }),
    prisma.transaction.count({ where: { type: 'DEPOSIT', status: 'PENDING' } }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, email: true, role: true, status: true, balance: true, createdAt: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Tổng quan</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Người dùng" value={users} hint={`+${newUsersToday} hôm nay`} />
        <StatCard label="Đơn hàng hôm nay" value={ordersToday} />
        <StatCard label="Doanh thu (đơn hoàn tất)" value={formatUsd(revenue._sum.totalAmount)} />
        <StatCard label="Tổng số dư khách" value={formatUsd(balances._sum.balance)} hint="Tiền khách đang giữ trên web" />
        <StatCard label="Yêu cầu nạp chờ duyệt" value={pendingDeposits} />
      </div>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Người dùng mới</h2>
          <Link href="/admin/users" className="text-sm font-medium text-blue-600 hover:underline">Xem tất cả →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Email</th><th>Quyền</th><th>Trạng thái</th><th>Số dư</th><th>Ngày tạo</th></tr>
            </thead>
            <tbody>
              {recentUsers.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td><Badge value={u.role} /></td>
                  <td><Badge value={u.status} /></td>
                  <td className="tabular-nums">{formatUsd(u.balance)}</td>
                  <td className="text-zinc-500">{formatDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
