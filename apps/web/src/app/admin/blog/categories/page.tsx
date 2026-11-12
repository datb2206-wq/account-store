import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { ActionButton, QuickForm } from '@/components/admin/quick-form';
import { PageHeader, Panel } from '@/components/admin/ui';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Chuyên mục bài viết' };

export default async function BlogCategoriesPage() {
  await requireStaff();
  const categories = await prisma.blogCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { _count: { select: { posts: true } } } });

  return (
    <div className="space-y-5">
      <PageHeader title="Chuyên mục bài viết">
        <Link href="/admin/blog" className="btn-ghost border border-zinc-200 bg-white">← Tất cả bài viết</Link>
      </PageHeader>
      <Panel title="Thêm chuyên mục">
        <QuickForm
          url="/api/admin/blog/categories"
          submitLabel="+ Thêm chuyên mục"
          columns={3}
          fields={[
            { name: 'name', label: 'Tên chuyên mục', required: true, placeholder: 'VD: Hướng dẫn' },
            { name: 'slug', label: 'Đường dẫn', required: true, placeholder: 'huong-dan' },
            { name: 'sortOrder', label: 'Thứ tự', type: 'number', placeholder: '0' },
            { name: 'isActive', label: 'Hiển thị', type: 'checkbox' },
          ]}
        />
      </Panel>
      <Panel title="Danh sách chuyên mục bài viết" bodyClassName="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Tên chuyên mục</th><th>Đường dẫn</th><th className="text-right">Số bài</th><th>Thứ tự</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>
            {categories.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-zinc-400">Chưa có chuyên mục nào</td></tr>}
            {categories.map((c) => (
              <tr key={c.id} className="odd:bg-zinc-50/60">
                <td className="font-medium">{c.name}</td>
                <td className="font-mono text-xs text-zinc-500">{c.slug}</td>
                <td className="text-right tabular-nums">{c._count.posts}</td>
                <td className="tabular-nums">{c.sortOrder}</td>
                <td><span className={`rounded px-2 py-0.5 text-xs font-medium ${c.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{c.isActive ? 'Hiển thị' : 'Ẩn'}</span></td>
                <td className="space-x-1 text-right whitespace-nowrap">
                  <ActionButton url={`/api/admin/blog/categories/${c.id}`} method="PATCH" body={{ isActive: !c.isActive }} label={c.isActive ? 'Ẩn' : 'Hiện'} className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium hover:bg-zinc-100" />
                  <ActionButton url={`/api/admin/blog/categories/${c.id}`} confirmText={`Xóa chuyên mục "${c.name}"? Bài viết bên trong vẫn được giữ.`} label="Xóa" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
