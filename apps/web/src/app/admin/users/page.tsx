import type { Metadata } from 'next';
import { prisma, type Prisma } from '@accszone/database';
import { UserStatusButton } from '@/components/admin/user-status-button';
import { Badge } from '@/components/badge';
import { Pagination } from '@/components/pagination';
import { requireStaff } from '@/lib/auth';
import { formatDate, formatUsd } from '@/lib/format';
import { buildHref } from '@/lib/url';

export const metadata: Metadata = { title: 'Người dùng' };

const PAGE_SIZE = 20;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const admin = await requireStaff();
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { username: { contains: q, mode: 'insensitive' } },
          { id: q },
        ],
      }
    : {};

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
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
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Người dùng <span className="text-base font-normal text-zinc-400">({total})</span></h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Tìm email, username, ID…" className="input w-64" />
          <button className="btn-primary">Tìm</button>
        </form>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Email / Username</th><th>Quyền</th><th>Trạng thái</th><th>Số dư</th>
              <th>Đăng nhập gần nhất</th><th>Ngày tạo</th><th />
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr><td colSpan={7} className="py-10 text-center text-zinc-500">Không tìm thấy người dùng nào.</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <p className="font-medium">{u.email}</p>
                  <p className="text-xs text-zinc-400">{u.username ?? u.id}</p>
                </td>
                <td><Badge value={u.role} /></td>
                <td><Badge value={u.status} /></td>
                <td className="tabular-nums">{formatUsd(u.balance)}</td>
                <td className="text-zinc-500">
                  {formatDate(u.lastLoginAt)}
                  {u.lastLoginIp && <p className="text-xs text-zinc-400">{u.lastLoginIp}</p>}
                </td>
                <td className="text-zinc-500">{formatDate(u.createdAt)}</td>
                <td className="text-right">
                  {admin.role === 'SUPER_ADMIN' && u.role !== 'SUPER_ADMIN' && <UserStatusButton id={u.id} email={u.email} banned={u.status === 'BANNED'} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => buildHref('/admin/users', { q, page: p > 1 ? p : undefined })} />
    </div>
  );
}
