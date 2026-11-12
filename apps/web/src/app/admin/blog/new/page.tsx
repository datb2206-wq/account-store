import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { blogPostFields } from '@/components/admin/blog-fields';
import { QuickForm } from '@/components/admin/quick-form';
import { PageHeader, Panel } from '@/components/admin/ui';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Viết bài mới' };

export default async function NewBlogPostPage() {
  await requireStaff();
  const categories = await prisma.blogCategory.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } });
  return (
    <div className="space-y-5">
      <PageHeader title="Viết bài mới">
        <Link href="/admin/blog" className="btn-ghost border border-zinc-200 bg-white">← Tất cả bài viết</Link>
      </PageHeader>
      <Panel title="Thêm bài viết mới">
        <QuickForm url="/api/admin/blog/posts" submitLabel="Đăng bài" redirectTo="/admin/blog" fields={blogPostFields(categories)} />
      </Panel>
    </div>
  );
}
