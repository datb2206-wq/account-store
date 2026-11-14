import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { PageHeader, Panel } from '@/components/admin/ui';
import { RoleForm } from '@/components/admin/role-form';
import { requireStaff } from '@/lib/auth';
import { ALL_PERMISSIONS } from '@/lib/permissions';
import { buildHref } from '@/lib/url';

export const metadata: Metadata = { title: 'Admin Role' };

export default async function RolesPage() {
  await requireStaff();
  const [roles, unassigned] = await Promise.all([
    prisma.adminRole.findMany({ orderBy: { createdAt: 'asc' }, include: { _count: { select: { users: true } } } }),
    prisma.user.count({ where: { role: 'STAFF', adminRoleId: null } }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader title="Admin Role" count={roles.length} />
      <p className="text-sm text-zinc-500">
        Tạo vai trò rồi gán cho nhân viên ở trang <Link href="/admin/users" className="text-indigo-600 hover:underline">Thành viên</Link> (nút &quot;Phân quyền&quot;).
        Super Admin luôn có toàn quyền.
        {unassigned > 0 && <> Có <b>{unassigned}</b> nhân viên chưa gán vai trò: họ dùng quyền nhân viên mặc định (mọi quyền trừ các thao tác chỉ dành cho Super Admin).</>}
      </p>

      <Panel title="Danh sách vai trò" bodyClassName="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Vai trò</th><th>Số quyền</th><th>Nhân viên</th><th /></tr></thead>
          <tbody>
            {roles.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-zinc-400">Chưa có vai trò nào</td></tr>}
            {roles.map((r) => (
              <tr key={r.id} className="odd:bg-zinc-50/60">
                <td>
                  <p className="font-medium text-zinc-800">{r.name}</p>
                  {r.description && <p className="text-xs text-zinc-400">{r.description}</p>}
                </td>
                <td className="tabular-nums">{r.permissions.length}/{ALL_PERMISSIONS.length}</td>
                <td>
                  <Link href={buildHref('/admin/users', { adminRole: r.id })} className="text-indigo-600 hover:underline">{r._count.users}</Link>
                </td>
                <td className="text-right"><Link href={`/admin/roles/${r.id}`} className="text-xs font-medium text-indigo-600 hover:underline">Sửa</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Tạo vai trò mới">
        <RoleForm />
      </Panel>
    </div>
  );
}
