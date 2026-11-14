import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { PageHeader, Panel } from '@/components/admin/ui';
import { Badge } from '@/components/badge';
import { can } from '@/lib/permissions';
import { requireStaff } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { workerOnline } from '@/lib/queue';

export const metadata: Metadata = { title: 'Kết nối API' };

const ADAPTER_LABEL: Record<string, string> = { accszone: 'AccsZone API v1', via79: 'Via79', generic: 'API khác' };

export default async function AdminSuppliersPage() {
  const user = await requireStaff();
  const [suppliers, online] = await Promise.all([
    prisma.supplier.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        adapter: true,
        baseUrl: true,
        priceMarkup: true,
        autoUpdatePrice: true,
        priceRounding: true,
        autoUpdateInfo: true,
        isActive: true,
        lastSyncAt: true,
        _count: { select: { products: true } },
      },
    }),
    workerOnline(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader title="Kết nối API" count={suppliers.length}>
        <Badge value={online ? 'Worker đang chạy' : 'Worker KHÔNG chạy'} tone={online ? 'green' : 'red'} />
        {can(user, 'suppliers.edit') && (
          <Link href="/admin/suppliers/new" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">+ Thêm API cần kết nối</Link>
        )}
      </PageHeader>

      <Panel title="Danh sách API đã kết nối" bodyClassName="overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Kết nối</th><th>Loại API</th><th>Tăng giá</th><th>Đồng bộ</th><th>Sản phẩm</th><th>Đồng bộ gần nhất</th><th>Trạng thái</th><th /></tr>
          </thead>
          <tbody>
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-zinc-500">
                  Chưa có kết nối API nào.{' '}
                  {can(user, 'suppliers.edit') && <Link href="/admin/suppliers/new" className="font-medium text-blue-600 hover:underline">Thêm kết nối đầu tiên</Link>}
                </td>
              </tr>
            )}
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link href={`/admin/suppliers/${s.id}`} className="font-medium hover:text-blue-600">{s.name}</Link>
                  <p className="max-w-64 truncate font-mono text-xs text-zinc-400">{s.baseUrl}</p>
                </td>
                <td className="text-sm">{ADAPTER_LABEL[s.adapter] ?? s.adapter}</td>
                <td className="tabular-nums">+{Math.round((Number(s.priceMarkup) - 1) * 10000) / 100}%</td>
                <td className="space-y-0.5 text-xs text-zinc-500">
                  <p>Giá: {s.autoUpdatePrice ? 'tự động' : 'giữ nguyên'}{s.priceRounding !== 'none' && ` · tròn $${s.priceRounding}`}</p>
                  <p>Tên & mô tả: {s.autoUpdateInfo ? 'tự động' : 'giữ nguyên'}</p>
                </td>
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
      </Panel>
    </div>
  );
}
