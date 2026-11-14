import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@accszone/database';
import { PageHeader, Panel } from '@/components/admin/ui';
import { RoleForm } from '@/components/admin/role-form';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Sửa vai trò' };

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const role = await prisma.adminRole.findUnique({ where: { id }, select: { id: true, name: true, description: true, permissions: true } });
  if (!role) notFound();
  return (
    <div className="space-y-5">
      <PageHeader title={`Vai trò: ${role.name}`}>
        <Link href="/admin/roles" className="btn-ghost border border-zinc-200">← Danh sách vai trò</Link>
      </PageHeader>
      <Panel title="Quyền của vai trò"><RoleForm role={role} /></Panel>
    </div>
  );
}
