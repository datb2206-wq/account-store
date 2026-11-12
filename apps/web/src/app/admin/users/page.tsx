import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type Prisma, type Role, type UserStatus } from '@accszone/database';
import { UserStatusButton } from '@/components/admin/user-status-button';
import { FilterBar, MiniStat, Panel } from '@/components/admin/ui';
import { Badge } from '@/components/badge';
import { CloseIcon, ShieldIcon, UsersIcon, WalletIcon } from '@/components/icons';
import { LocalTime } from '@/components/local-time';
import { Pagination } from '@/components/pagination';
import { requireStaff } from '@/lib/auth';
import { formatUsd } from '@/lib/format';
import { buildHref } from '@/lib/url';

export const metadata: Metadata = { title: 'Thành viên' };

const PAGE_SIZE = 20;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string; sort?: string; page?: string }>;
}) {
  const admin = await requireStaff();
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const role = (['USER', 'STAFF', 'SUPER_ADMIN'] as Role[]).find((r) => r === params.role);
  const status = (['ACTIVE', 'BANNED', 'PENDING_VERIFY'] as UserStatus[]).find((x) => x === params.status);
  const sort = params.sort === 'balance' ? 'balance' : undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  const where: Prisma.UserWhereInput = {
    role,
    status,
    OR: q ? [{ email: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }, { id: q }] : undefined,
  };

  const [total, users, allUsers, balances, staff, banned] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: sort ? [{ balance: 'desc' }, { createdAt: 'desc' }] : { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        status: true,
        balance: true,
        createdAt: true,
        lastLoginAt: true,
        lastLoginIp: true,
      },
    }),
    prisma.user.count(),
    prisma.user.aggregate({ _sum: { balance: true } }),
    prisma.user.count({ where: { role: { not: 'USER' } } }),
    prisma.user.count({ where: { status: 'BANNED' } }),
  ]);
  // Tổng tiền đã nạp (giao dịch nạp hoàn tất) của các thành viên đang hiện
  const deposits = await prisma.transaction.groupBy({
    by: ['userId'],
    where: { type: 'DEPOSIT', status: 'COMPLETED', userId: { in: users.map((u) => u.id) } },
    _sum: { amount: true },
  });
  const depositOf = new Map(deposits.map((d) => [d.userId, d._sum.amount]));
  const filters = { q: q || undefined, role, status, sort };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-zinc-800">Thành viên</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat tone="violet" icon={<UsersIcon size={20} />} value={allUsers.toLocaleString('en-US')} label="Tổng thành viên" />
        <MiniStat tone="sky" icon={<WalletIcon size={20} />} value={formatUsd(balances._sum.balance)} label="Số dư còn lại" />
        <MiniStat tone="amber" icon={<ShieldIcon size={20} />} value={staff} label="Admin / nhân viên" />
        <MiniStat tone="red" icon={<CloseIcon size={20} />} value={banned} label="Bị khóa" />
      </div>

      <Panel title="Danh sách thành viên">
        <div className="space-y-4">
          <FilterBar resetHref="/admin/users" active={Object.values(filters).some(Boolean)}>
            <input name="q" defaultValue={q} placeholder="Email, username, ID…" className="input w-60" />
            <select name="role" defaultValue={role ?? ''} className="input w-40">
              <option value="">Mọi vai trò</option>
              <option value="USER">Thành viên</option>
              <option value="STAFF">Nhân viên</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
            <select name="status" defaultValue={status ?? ''} className="input w-40">
              <option value="">Mọi trạng thái</option>
              <option value="ACTIVE">Hoạt động</option>
              <option value="BANNED">Bị khóa</option>
            </select>
            <select name="sort" defaultValue={sort ?? ''} className="input w-44">
              <option value="">Mới đăng ký trước</option>
              <option value="balance">Số dư cao nhất</option>
            </select>
          </FilterBar>

          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Thành viên</th><th>Vai trò</th><th>Trạng thái</th><th className="text-right">Số dư</th><th className="text-right">Tổng nạp</th>
                  <th>Đăng nhập gần nhất</th><th>Ngày đăng ký</th><th />
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr><td colSpan={8} className="py-10 text-center text-zinc-400">Không tìm thấy thành viên nào.</td></tr>
                )}
                {users.map((u) => (
                  <tr key={u.id} className="odd:bg-zinc-50/60">
                    <td>
                      <p className="font-medium text-indigo-600">{u.email}</p>
                      <p className="text-xs text-zinc-400">{u.username ?? u.id}</p>
                    </td>
                    <td><Badge value={u.role} /></td>
                    <td><Badge value={u.status} /></td>
                    <td className="text-right font-semibold text-blue-700 tabular-nums">{formatUsd(u.balance)}</td>
                    <td className="text-right text-emerald-600 tabular-nums">{formatUsd(depositOf.get(u.id))}</td>
                    <td className="text-xs text-zinc-500">
                      {u.lastLoginAt ? <LocalTime value={u.lastLoginAt} /> : '—'}
                      {u.lastLoginIp && <p className="font-mono text-[11px] text-zinc-400">{u.lastLoginIp}</p>}
                    </td>
                    <td className="text-xs text-zinc-500"><LocalTime value={u.createdAt} /></td>
                    <td className="text-right whitespace-nowrap">
                      <Link href={buildHref('/admin/balance-logs', { q: u.email })} className="mr-2 text-xs font-medium text-indigo-600 hover:underline">Số dư</Link>
                      <Link href={buildHref('/admin/activity', { q: u.email })} className="mr-2 text-xs font-medium text-indigo-600 hover:underline">Nhật ký</Link>
                      {admin.role === 'SUPER_ADMIN' && u.role !== 'SUPER_ADMIN' && <UserStatusButton id={u.id} email={u.email} banned={u.status === 'BANNED'} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={page} totalPages={totalPages} hrefFor={(p) => buildHref('/admin/users', { ...filters, page: p > 1 ? p : undefined })} />
        </div>
      </Panel>
    </div>
  );
}
