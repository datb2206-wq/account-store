import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { SupplierForm } from '@/components/admin/supplier-form';
import { Badge } from '@/components/badge';
import { requireStaff } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { workerOnline } from '@/lib/queue';

export const metadata: Metadata = { title: 'Nhà cung cấp' };

export default async function AdminSuppliersPage() {
  const user = await requireStaff();
  const [suppliers, online] = await Promise.all([
    prisma.supplier.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        priceMarkup: true,
        isActive: true,
        lastSyncAt: true,
        _count: { select: { products: true } },
      },
    }),
    workerOnline(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Nhà cung cấp</h1>
        <Badge value={online ? 'Worker đang chạy' : 'Worker KHÔNG chạy'} tone={online ? 'green' : 'red'} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_380px]">
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr><th>Tên</th><th>Markup</th><th>Sản phẩm</th><th>Đồng bộ gần nhất</th><th>Trạng thái</th><th /></tr>
            </thead>
            <tbody>
              {suppliers.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-zinc-500">Chưa có nhà cung cấp nào.</td></tr>
              )}
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/admin/suppliers/${s.id}`} className="font-medium hover:text-blue-600">{s.name}</Link>
                    <p className="max-w-64 truncate font-mono text-xs text-zinc-400">{s.baseUrl}</p>
                  </td>
                  <td className="tabular-nums">×{s.priceMarkup.toString()}</td>
                  <td className="tabular-nums">{s._count.products}</td>
                  <td className="text-zinc-500">{formatDate(s.lastSyncAt)}</td>
                  <td><Badge value={s.isActive ? 'Bật' : 'Tắt'} tone={s.isActive ? 'green' : 'gray'} /></td>
                  <td className="text-right">
                    <Link href={`/admin/suppliers/${s.id}`} className="text-sm font-medium text-blue-600 hover:underline">Chi tiết</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {user.role === 'SUPER_ADMIN' ? (
          <SupplierForm />
        ) : (
          <div className="card text-sm text-zinc-500">Chỉ SUPER_ADMIN được thêm/sửa nhà cung cấp.</div>
        )}
      </div>
    </div>
  );
}
