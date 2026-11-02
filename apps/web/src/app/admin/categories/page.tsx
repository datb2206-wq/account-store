import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { CategoryForm, type CategoryFormValues } from '@/components/admin/category-form';
import { Badge } from '@/components/badge';
import { requireStaff } from '@/lib/auth';
import { descendantIds, flattenTree, treeOptions } from '@/lib/category-tree';
import { localized } from '@/lib/format';

export const metadata: Metadata = { title: 'Danh mục' };

export default async function AdminCategoriesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireStaff();
  const { edit } = await searchParams;

  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { _count: { select: { products: true } } },
  });
  const editing = edit ? categories.find((c) => c.id === edit) : undefined;

  const initial: CategoryFormValues | undefined = editing && {
    slug: editing.slug,
    name: editing.name as CategoryFormValues['name'],
    description: (editing.description ?? {}) as CategoryFormValues['description'],
    iconUrl: editing.iconUrl ?? '',
    parentId: editing.parentId ?? '',
    sortOrder: editing.sortOrder,
    isActive: editing.isActive,
  };
  // Không cho chọn chính nó / con cháu của nó làm cha
  const exclude = editing ? new Set([editing.id, ...descendantIds(categories, editing.id)]) : undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Danh mục <span className="text-base font-normal text-zinc-400">({categories.length})</span></h1>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_400px]">
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr><th>Tên</th><th>Slug</th><th>Sản phẩm</th><th>Thứ tự</th><th>Trạng thái</th><th /></tr>
            </thead>
            <tbody>
              {categories.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-zinc-500">Chưa có danh mục nào. Tạo danh mục đầu tiên ở form bên cạnh.</td></tr>
              )}
              {flattenTree(categories).map(({ item: c, depth }) => (
                <tr key={c.id} className={c.id === editing?.id ? 'bg-blue-50/50' : undefined}>
                  <td style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}>
                    {depth > 0 && <span className="mr-1 text-zinc-300">└</span>}
                    <span className="font-medium">{localized(c.name)}</span>
                  </td>
                  <td className="font-mono text-xs text-zinc-500">{c.slug}</td>
                  <td>
                    <Link href={`/admin/products?category=${c.id}`} className="text-blue-600 hover:underline">{c._count.products}</Link>
                  </td>
                  <td className="tabular-nums">{c.sortOrder}</td>
                  <td><Badge value={c.isActive ? 'Hiển thị' : 'Ẩn'} tone={c.isActive ? 'green' : 'gray'} /></td>
                  <td className="text-right">
                    <Link href={`/admin/categories?edit=${c.id}`} className="text-sm font-medium text-blue-600 hover:underline">Sửa</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <CategoryForm
          key={editing?.id ?? 'new'}
          categoryId={editing?.id}
          initial={initial}
          parentOptions={treeOptions(categories, exclude)}
        />
      </div>
    </div>
  );
}
