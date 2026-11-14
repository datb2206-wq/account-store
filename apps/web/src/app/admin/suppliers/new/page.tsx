import type { Metadata } from 'next';
import Link from 'next/link';
import { SupplierForm } from '@/components/admin/supplier-form';
import { SupplierNotes } from '@/components/admin/supplier-notes';
import { Panel } from '@/components/admin/ui';
import { can } from '@/lib/permissions';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Thêm API cần kết nối' };

export default async function NewSupplierPage() {
  const user = await requireStaff();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/suppliers" className="grid size-8 place-items-center rounded-lg bg-zinc-800 text-white hover:bg-zinc-700" aria-label="Quay lại">←</Link>
        <h1 className="text-xl font-semibold text-zinc-800">Thêm API cần kết nối</h1>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_400px]">
        <Panel title="Nhập thông tin API cần kết nối">
          {can(user, 'suppliers.edit') ? <SupplierForm /> : <p className="text-sm text-zinc-500">Bạn không có quyền thêm kết nối API.</p>}
        </Panel>
        <SupplierNotes />
      </div>
    </div>
  );
}
