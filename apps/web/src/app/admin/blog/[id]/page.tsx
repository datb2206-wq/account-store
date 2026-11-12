import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@accszone/database';
import { blogPostFields } from '@/components/admin/blog-fields';
import { QuickForm } from '@/components/admin/quick-form';
import { PageHeader, Panel } from '@/components/admin/ui';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Sửa bài viết' };

export default async function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const [post, categories] = await Promise.all([
    prisma.blogPost.findUnique({ where: { id } }),
    prisma.blogCategory.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
  ]);
  if (!post) notFound();

  return (
    <div className="space-y-5">
      <PageHeader title="Sửa bài viết">
        <Link href="/admin/blog" className="btn-ghost border border-zinc-200 bg-white">← Tất cả bài viết</Link>
        {post.isPublished && <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer" className="btn-ghost border border-zinc-200 bg-white">Xem bài ↗</a>}
      </PageHeader>
      <Panel title={post.title}>
        <QuickForm url={`/api/admin/blog/posts/${post.id}`} method="PATCH" submitLabel="Lưu thay đổi" resetOnSuccess={false} fields={blogPostFields(categories, post)} />
      </Panel>
    </div>
  );
}
