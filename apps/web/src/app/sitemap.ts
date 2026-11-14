import type { MetadataRoute } from 'next';
import { prisma } from '@accszone/database';
import { getSiteUrl } from '@/lib/site';
import { getSiteExtras, publishedPages } from '@/lib/site-extras';

// Dựng theo tên miền đang truy cập nên chạy được với nhiều tên miền (.co, .me, .info…)
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await getSiteUrl();
  const [categories, posts, extras] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    prisma.blogPost.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true }, take: 5000 }),
    getSiteExtras(),
  ]);
  return [
    { url: base, changeFrequency: 'hourly', priority: 1 },
    ...categories.map((c) => ({
      url: `${base}/?category=${encodeURIComponent(c.slug)}`,
      lastModified: c.updatedAt,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    { url: `${base}/blog`, changeFrequency: 'daily', priority: 0.6 },
    ...publishedPages(extras).map((p) => ({ url: `${base}/pages/${p.slug}`, changeFrequency: 'monthly' as const, priority: 0.4 })),
    ...posts.map((p) => ({ url: `${base}/blog/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'weekly' as const, priority: 0.5 })),
  ];
}
