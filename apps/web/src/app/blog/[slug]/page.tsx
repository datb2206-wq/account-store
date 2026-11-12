import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { prisma } from '@accszone/database';
import { BlogContent } from '@/components/blog-content';
import { LocalTime } from '@/components/local-time';
import { fmt } from '@/i18n/config';
import { getI18n } from '@/i18n/server';

const getPost = cache((slug: string) =>
  prisma.blogPost.findFirst({
    where: { slug, isPublished: true },
    select: { id: true, title: true, excerpt: true, content: true, coverUrl: true, views: true, createdAt: true, category: { select: { name: true, slug: true } } },
  }),
);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = await getPost((await params).slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    openGraph: { type: 'article', title: post.title, description: post.excerpt ?? undefined, images: post.coverUrl ? [post.coverUrl] : undefined },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPost((await params).slug);
  if (!post) notFound();
  const { d } = await getI18n();
  // Đếm lượt xem (không cần chính xác tuyệt đối, lỗi cũng không chặn trang)
  await prisma.blogPost.update({ where: { id: post.id }, data: { views: { increment: 1 } }, select: { id: true } }).catch(() => null);

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Link href="/blog" className="text-sm text-zinc-500 hover:underline">{d.blog.back}</Link>
      <header className="space-y-2">
        <p className="text-xs text-zinc-400">
          {post.category && <Link href={`/blog?category=${post.category.slug}`} className="mr-2 font-medium text-blue-600">{post.category.name}</Link>}
          <LocalTime value={post.createdAt} /> · {fmt(d.blog.views, { n: (post.views + 1).toLocaleString('en-US') })}
        </p>
        <h1 className="text-3xl font-bold text-zinc-900">{post.title}</h1>
        {post.excerpt && <p className="text-lg text-zinc-500">{post.excerpt}</p>}
      </header>
      {post.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh do admin dán link ngoài
        <img src={post.coverUrl} alt="" className="w-full rounded-xl object-cover" />
      )}
      <div className="card"><BlogContent text={post.content} /></div>
    </article>
  );
}
