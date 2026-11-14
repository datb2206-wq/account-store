import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CONTENT_PAGES, type ContentPage } from '@accszone/core';
import { BlogContent } from '@/components/blog-content';
import { CONTENT_PAGE_LABEL, getSiteExtras } from '@/lib/site-extras';

type Props = { params: Promise<{ slug: string }> };

// Trang nội dung admin viết ở Admin > Cài đặt website (Chính sách, Điều khoản, FAQ, Liên hệ)
async function load(slug: string) {
  if (!(CONTENT_PAGES as readonly string[]).includes(slug)) return null;
  const page = (await getSiteExtras()).pages[slug as ContentPage];
  if (!page.body.trim()) return null;
  return { title: page.title || CONTENT_PAGE_LABEL[slug as ContentPage], body: page.body };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).slug);
  return page ? { title: page.title, alternates: { canonical: `/pages/${(await params).slug}` } } : {};
}

export default async function ContentPageView({ params }: Props) {
  const page = await load((await params).slug);
  if (!page) notFound();
  return (
    <article className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm sm:p-10">
      <h1 className="mb-6 text-2xl font-bold text-zinc-900 sm:text-3xl">{page.title}</h1>
      <BlogContent text={page.body} />
    </article>
  );
}
