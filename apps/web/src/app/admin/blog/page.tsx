import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type Prisma } from '@accszone/database';
import { ActionButton } from '@/components/admin/quick-form';
import { FilterBar, PageHeader, Panel } from '@/components/admin/ui';
import { LocalTime } from '@/components/local-time';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Bài viết' };

export default async function AdminBlogPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const where: Prisma.BlogPostWhereInput = { title: q ? { contains: q, mode: 'insensitive' } : undefined, categoryId: sp.category || undefined };
  const [posts, categories] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, title: true, slug: true, coverUrl: true, isPublished: true, views: true, createdAt: true, category: { select: { name: true } } },
    }),
    prisma.blogCategory.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader title="Bài viết" count={posts.length}>
        <Link href="/admin/blog/categories" className="btn-ghost border border-zinc-200 bg-white">Chuyên mục</Link>
        <Link href="/admin/blog/new" className="btn-primary bg-indigo-500 hover:bg-indigo-600">+ Viết bài mới</Link>
      </PageHeader>

      <Panel title="Danh sách bài viết">
        <div className="space-y-4">
          <FilterBar resetHref="/admin/blog" active={!!q || !!sp.category}>
            <input name="q" defaultValue={q} placeholder="Tiêu đề" className="input w-60" />
            <select name="category" defaultValue={sp.category ?? ''} className="input w-48">
              <option value="">— Chuyên mục —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FilterBar>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Tiêu đề bài viết</th><th>Ảnh</th><th>Chuyên mục</th><th>Trạng thái</th><th className="text-right">Lượt xem</th><th>Ngày đăng</th><th /></tr></thead>
              <tbody>
                {posts.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-zinc-400">Chưa có bài viết nào</td></tr>}
                {posts.map((p) => (
                  <tr key={p.id} className="odd:bg-zinc-50/60">
                    <td className="max-w-md">
                      <Link href={`/admin/blog/${p.id}`} className="font-medium text-zinc-800 hover:text-indigo-600">{p.title}</Link>
                      <p className="font-mono text-[11px] text-zinc-400">/blog/{p.slug}</p>
                    </td>
                    <td>
                      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh do admin dán link ngoài */}
                      {p.coverUrl ? <img src={p.coverUrl} alt="" className="h-10 w-16 rounded object-cover" /> : <span className="text-xs text-zinc-300">—</span>}
                    </td>
                    <td className="text-sm text-indigo-600">{p.category?.name ?? '—'}</td>
                    <td>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${p.isPublished ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{p.isPublished ? 'Hiển thị' : 'Ẩn'}</span>
                    </td>
                    <td className="text-right tabular-nums">{p.views.toLocaleString('en-US')}</td>
                    <td className="text-xs whitespace-nowrap text-zinc-500"><LocalTime value={p.createdAt} /></td>
                    <td className="space-x-1 text-right whitespace-nowrap">
                      {p.isPublished && <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium hover:bg-zinc-100">Xem</a>}
                      <Link href={`/admin/blog/${p.id}`} className="rounded-md bg-indigo-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-600">Sửa</Link>
                      <ActionButton url={`/api/admin/blog/posts/${p.id}`} confirmText={`Xóa bài "${p.title}"?`} label="Xóa" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>
    </div>
  );
}
