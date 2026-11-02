import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site';

export default async function robots(): Promise<MetadataRoute.Robots> {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/dashboard', '/api/'] },
    sitemap: `${await getSiteUrl()}/sitemap.xml`,
  };
}
