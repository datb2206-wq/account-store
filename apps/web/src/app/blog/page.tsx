import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { LocalTime } from '@/components/local-time';
import { getI18n } from '@/i18n/server';
import { buildHref } from '@/lib/url';

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return { title: d.blog.title, description: d.blog.subtitle };
}

export default async function BlogListPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { d } = await getI18n();
  const t = d.blog;
  const slug = (await searchParams).category;
  const categories = await prisma.blogCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, slug: true } });
  const selected = categories.find((c) => c.slug === slug);
  const posts = await prisma.blogPost.findMany({
    where: { isPublished: true, ...(selected && { categoryId: selected.id }) },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: { slug: true, title: true, excerpt: true, coverUrl: true, createdAt: true, category: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="text-sm text-zinc-500">{t.subtitle}</p>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link href="/blog" className={`rounded-full px-3 py-1 text-sm ${!selected ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50'}`}>{t.all}</Link>
          {categories.map((c) => (
            <Link key={c.id} href={buildHref('/blog', { category: c.slug })} className={`rounded-full px-3 py-1 text-sm ${selected?.id === c.id ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50'}`}>
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {posts.length === 0 ? (
        <p className="card py-12 text-center text-zinc-500">{t.empty}</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className="group overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:shadow-md">
              {p.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- ảnh do admin dán link ngoài
                <img src={p.coverUrl} alt="" className="aspect-video w-full object-cover" loading="lazy" />
              ) : (
                <div className="aspect-video w-full bg-gradient-to-br from-blue-50 to-indigo-100" />
              )}
              <div className="space-y-2 p-4">
                <p className="text-xs text-zinc-400">
                  {p.category && <span className="mr-2 font-medium text-blue-600">{p.category.name}</span>}
                  <LocalTime value={p.createdAt} />
                </p>
                <h2 className="line-clamp-2 font-semibold text-zinc-900 group-hover:text-blue-700">{p.title}</h2>
                {p.excerpt && <p className="line-clamp-3 text-sm text-zinc-500">{p.excerpt}</p>}
                <p className="text-sm font-medium text-blue-600">{t.readMore}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
