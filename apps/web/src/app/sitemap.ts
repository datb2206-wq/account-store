import type { MetadataRoute } from 'next';
import { prisma } from '@accszone/database';
import { getSiteUrl } from '@/lib/site';

// Dựng theo tên miền đang truy cập nên chạy được với nhiều tên miền (.co, .me, .info…)
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await getSiteUrl();
  const categories = await prisma.category.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } });
  return [
    { url: base, changeFrequency: 'hourly', priority: 1 },
    ...categories.map((c) => ({
      url: `${base}/?category=${encodeURIComponent(c.slug)}`,
      lastModified: c.updatedAt,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];
}
