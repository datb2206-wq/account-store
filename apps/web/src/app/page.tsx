import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { BoltIcon, BoxIcon, CloseIcon, FireIcon, ShieldIcon } from '@/components/icons';
import { BuyButton } from '@/components/shop/buy-button';
import { CategoryIcon } from '@/components/shop/category-icon';
import { SiteSupport } from '@/components/shop/site-support';
import { MaintenanceScreen } from '@/components/maintenance-screen';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { StatCard } from '@/components/stat-card';
import { formatFx, plural, fmt } from '@/i18n/config';
import type { Dictionary } from '@/i18n/dictionaries';
import { getI18n } from '@/i18n/server';
import { getCurrentUser } from '@/lib/auth';
import { cached, SHOP_STOCK_CACHE } from '@/lib/cache';
import { descendantIds, flattenTree } from '@/lib/category-tree';
import { formatUsd, localized } from '@/lib/format';
import { blockedByMaintenance, getSiteConfig } from '@/lib/site';
import { getSiteAssets } from '@/lib/site-assets';
import { buildHref } from '@/lib/url';

const SORTS = {
  recommended: 'sortRecommended',
  popular: 'sortPopular',
  price_asc: 'sortPriceAsc',
  price_desc: 'sortPriceDesc',
  stock: 'sortStock',
} as const satisfies Record<string, keyof Dictionary['shop']>;
type Sort = keyof typeof SORTS;

const LOW_STOCK = 10;
// Xem tất cả danh mục: mỗi bảng chỉ hiện vài dòng đầu + link "Xem tất cả"
const SECTION_LIMIT = 6;
// Cột bảng sản phẩm: Sản phẩm | Tồn kho | "Giá mỗi cái" (từ lg) | Giá | Mua
const COLS = 'md:grid-cols-[minmax(0,1fr)_120px_90px_104px] lg:grid-cols-[minmax(0,1fr)_150px_120px_100px_104px]';
// Đếm kho trên hàng triệu dòng khá nặng -> cache ngắn. Tiền và tồn kho thật vẫn kiểm tra trong transaction lúc mua.
const STOCK_TTL_SEC = 15;
const SOLD_TTL_SEC = 60;

// Mỗi danh mục có tiêu đề và URL riêng để máy tìm kiếm lập chỉ mục; trang kết quả tìm kiếm thì không
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ category?: string; q?: string }> }): Promise<Metadata> {
  const [params, { locale, d }, { name: siteName }] = await Promise.all([searchParams, getI18n(), getSiteConfig()]);
  const category = params.category
    ? await prisma.category.findFirst({ where: { slug: params.category, isActive: true }, select: { slug: true, name: true, description: true } })
    : null;
  const title = category ? localized(category.name, locale) : undefined;
  const description = (category && localized(category.description, locale)) || d.meta.description;
  return {
    // Template của root layout không áp dụng cho page cùng segment -> tự ghép tên website
    ...(title && { title: { absolute: `${title} · ${siteName}` } }),
    description,
    alternates: { canonical: category ? `/?category=${encodeURIComponent(category.slug)}` : '/' },
    openGraph: { type: 'website', siteName, title: title ?? siteName, description },
    ...(params.q && { robots: { index: false, follow: true } }),
  };
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; sort?: string; instock?: string }>;
}) {
  const [user, { locale, d, fx }, assets] = await Promise.all([getCurrentUser(), getI18n(), getSiteAssets()]);
  if (await blockedByMaintenance(user)) return <MaintenanceScreen />;
  const t = d.shop;
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const sort: Sort = params.sort && params.sort in SORTS ? (params.sort as Sort) : 'recommended';
  const inStockOnly = params.instock === '1';

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, slug: true, name: true, description: true, parentId: true, iconUrl: true },
  });
  const selected = params.category ? categories.find((c) => c.slug === params.category) : undefined;

  // Toàn bộ sản phẩm đang bán (cho thanh danh mục), sau đó lọc theo danh mục/tìm kiếm
  const allProducts = await prisma.product.findMany({
    where: { isActive: true, categoryId: { in: categories.map((c) => c.id) } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, slug: true, name: true, description: true, price: true, minQty: true, maxQty: true, categoryId: true, source: true, externalStock: true },
  });
  const ids = new Set(allProducts.map((p) => p.id));
  const [stockRows, soldRows] = await Promise.all([
    cached(SHOP_STOCK_CACHE, STOCK_TTL_SEC, async () =>
      (await prisma.stockItem.groupBy({ by: ['productId'], where: { status: 'AVAILABLE' }, _count: true })).map((g): [string, number] => [g.productId, g._count]),
    ),
    cached('shop:sold', SOLD_TTL_SEC, async () =>
      (await prisma.order.groupBy({ by: ['productId'], where: { status: 'COMPLETED' }, _sum: { quantity: true } })).map((g): [string, number] => [g.productId, g._sum.quantity ?? 0]),
    ),
  ]);
  const localStock = new Map(stockRows);
  // Bỏ sản phẩm đã ẩn: nhãn HOT chỉ tính trong hàng đang bán
  const sold = new Map(soldRows.filter(([id]) => ids.has(id)));
  const stockOf = (p: (typeof allProducts)[number]) => (p.source === 'LOCAL' ? (localStock.get(p.id) ?? 0) : (p.externalStock ?? 0));

  // Top 3 bán chạy -> nhãn HOT
  const hot = new Set([...sold].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id));

  const allowedCats = new Set(selected ? [selected.id, ...descendantIds(categories, selected.id)] : categories.map((c) => c.id));
  const needle = q.toLowerCase();
  const products = allProducts.filter(
    (p) =>
      allowedCats.has(p.categoryId) &&
      (!inStockOnly || stockOf(p) > 0) &&
      (!needle || localized(p.name, locale).toLowerCase().includes(needle) || localized(p.name).toLowerCase().includes(needle) || p.slug.includes(needle)),
  );
  const compare: Record<Sort, ((a: (typeof products)[number], b: (typeof products)[number]) => number) | null> = {
    recommended: null,
    popular: (a, b) => (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0),
    price_asc: (a, b) => a.price.comparedTo(b.price),
    price_desc: (a, b) => b.price.comparedTo(a.price),
    stock: (a, b) => stockOf(b) - stockOf(a),
  };
  if (compare[sort]) products.sort(compare[sort]!);

  // Nhóm theo danh mục, giữ thứ tự cây
  const byCategory = new Map<string, typeof products>();
  for (const p of products) byCategory.set(p.categoryId, [...(byCategory.get(p.categoryId) ?? []), p]);
  const sections = flattenTree(categories).filter(({ item }) => byCategory.has(item.id));

  const parentOf = (id: string | null) => categories.find((c) => c.id === id);
  const inStockTotal = products.reduce((s, p) => s + stockOf(p), 0);
  const soldTotal = products.reduce((s, p) => s + (sold.get(p.id) ?? 0), 0);

  const keep = { category: selected?.slug, q, sort: sort === 'recommended' ? undefined : sort, instock: inStockOnly ? '1' : undefined };
  // Đang tìm kiếm / đã chọn danh mục: hiện đủ; trang tổng: rút gọn từng bảng
  const limit = selected || q ? Infinity : SECTION_LIMIT;

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader user={user} q={q} category={selected?.slug} />

      <main className="site-container space-y-6 py-6 sm:py-8">
        {/* Banner (Admin > Giao diện): chỉ ở trang tổng, không hiện khi đang tìm kiếm / xem 1 danh mục */}
        {assets.banner && !q && !selected && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assets.banner} alt={t.title} fetchPriority="high" className="block max-h-[400px] w-full rounded-xl object-cover" />
        )}
        {/* ---------- TIÊU ĐỀ + THỐNG KÊ ---------- */}
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-[26px]">{selected ? localized(selected.name, locale) : t.title}</h1>
          <span className="mt-2 block h-[3px] w-11 rounded-full bg-orange-600" aria-hidden />
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-600">{(selected && localized(selected.description, locale)) || t.subtitle}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t.statProducts} value={products.length.toLocaleString('en-US')} />
          <StatCard label={t.statInStock} value={inStockTotal.toLocaleString('en-US')} />
          <StatCard label={t.statSold} value={soldTotal.toLocaleString('en-US')} />
          <StatCard label={t.categories} value={sections.length.toLocaleString('en-US')} />
        </div>

        {/* ---------- SẮP XẾP + LỌC ---------- */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-zinc-600">
            <b className="text-zinc-900">{plural(locale, products.length, t.products)}</b>
            {q && (
              <Link
                href={buildHref('/', { ...keep, q: undefined })}
                title={t.clearFilters}
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/15 hover:bg-blue-100"
              >
                “{q}” <CloseIcon size={12} />
              </Link>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {(Object.keys(SORTS) as Sort[]).map((s) => (
              <Link
                key={s}
                href={buildHref('/', { ...keep, sort: s === 'recommended' ? undefined : s })}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${sort === s ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-700 hover:bg-zinc-100'}`}
              >
                {t[SORTS[s]]}
              </Link>
            ))}
            <Link
              href={buildHref('/', { ...keep, instock: inStockOnly ? undefined : '1' })}
              className={`ml-1 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition ${inStockOnly ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/30' : 'bg-white text-zinc-700 ring-transparent hover:bg-zinc-100'}`}
            >
              <span className={`size-3 rounded border ${inStockOnly ? 'border-emerald-600 bg-emerald-600' : 'border-zinc-300'}`} /> {t.inStockOnly}
            </Link>
          </div>
        </div>

        {sections.length === 0 && (
          <div className="rounded-xl bg-white py-16 text-center">
            <p className="font-medium text-zinc-700">{t.emptyTitle}</p>
            <p className="mt-1 text-sm text-zinc-500">{q || inStockOnly ? t.emptyFiltered : t.emptySoon}</p>
            {(q || inStockOnly || selected) && <Link href="/" className="btn-ghost mt-4 inline-flex border border-zinc-200">{t.clearFilters}</Link>}
          </div>
        )}

        {/* ---------- BẢNG SẢN PHẨM THEO DANH MỤC ---------- */}
        {sections.map(({ item: category }) => {
          const list = byCategory.get(category.id)!;
          const shown = list.slice(0, limit);
          const hidden = list.length - shown.length;
          const categoryName = localized(category.name, locale);
          const parent = parentOf(category.parentId);
          const categoryHref = buildHref('/', { ...keep, category: category.slug });
          return (
            <section key={category.id} aria-labelledby={`cat-${category.id}`} className="space-y-2">
              <div className={`grid items-center gap-x-4 rounded-lg bg-zinc-900 px-3 py-2.5 text-white ${COLS}`}>
                <h2 id={`cat-${category.id}`} className="min-w-0 text-base font-bold sm:text-lg">
                  <Link href={categoryHref} className="hover:text-orange-400">
                    {parent ? `${localized(parent.name, locale)} - ${categoryName}` : categoryName}
                  </Link>
                </h2>
                <span className="hidden font-bold md:block">{t.colStock}</span>
                <span className="hidden lg:block" />
                <span className="hidden font-bold md:block">{t.colPrice}</span>
                <span className="hidden md:block" />
              </div>

              <ul className="space-y-2">
                {shown.map((p) => {
                  const stock = stockOf(p);
                  const name = localized(p.name, locale);
                  const description = localized(p.description, locale);
                  const soldN = (sold.get(p.id) ?? 0).toLocaleString('en-US');
                  const local = formatFx(p.price.toString(), fx, locale);
                  const minNote = p.minQty > 1 ? fmt(t.minQty, { n: p.minQty }) : null;
                  return (
                    <li key={p.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 rounded-lg bg-white p-3 ${COLS}`}>
                      <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
                        <span className="hidden sm:block">
                          <CategoryIcon name={categoryName} slug={category.slug} iconUrl={category.iconUrl} fallbackUrl={assets.productDefault} size="lg" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm leading-6 font-medium text-zinc-900">
                            {name}
                            {hot.has(p.id) && (
                              <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 align-middle text-[10px] font-bold text-orange-700"><FireIcon size={10} /> {t.hot}</span>
                            )}
                          </p>
                          {description && <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-zinc-500">{description.split('\n')[0]}</p>}
                          {/* Mobile: tồn kho + đã bán dưới tên */}
                          <p className="mt-1.5 flex items-center gap-2 text-sm md:hidden">
                            <StockCount stock={stock} t={t} />
                            <span className="text-xs text-zinc-500">{fmt(t.soldCount, { n: soldN })}</span>
                          </p>
                        </div>
                      </div>
                      <div className="hidden md:block">
                        <p className="text-sm"><StockCount stock={stock} t={t} /></p>
                        <p className="mt-0.5 text-[13px] text-zinc-500 tabular-nums">{fmt(t.soldCount, { n: soldN })}</p>
                      </div>
                      <p className="hidden text-sm text-zinc-500 lg:block">{t.pricePerPc}</p>
                      <div>
                        <p translate="no" className="text-base font-bold text-zinc-900 tabular-nums">{formatUsd(p.price)}</p>
                        {/* Giá quy đổi theo ngôn ngữ (≈ Rp / ₽ / ¥) */}
                        {(local ?? minNote) && <p translate={local ? 'no' : undefined} className="text-[11px] whitespace-nowrap text-zinc-500 tabular-nums">{local ?? minNote}</p>}
                        {local && minNote && <p className="text-[11px] text-zinc-500">{minNote}</p>}
                      </div>
                      <div className="flex justify-end">
                        <BuyButton
                          balance={user ? user.balance.toString() : null}
                          product={{ id: p.id, name, description, price: p.price.toString(), stock, minQty: p.minQty, maxQty: p.maxQty }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>

              {hidden > 0 && (
                <Link href={categoryHref} className="block rounded-lg bg-orange-600 py-2.5 text-center text-sm font-bold text-white uppercase transition hover:bg-orange-700">
                  {fmt(t.viewMore, { n: hidden })}
                </Link>
              )}
            </section>
          );
        })}

        {/* Cam kết */}
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: <BoltIcon size={18} />, title: t.perkAutoTitle, text: t.perkAutoText },
            { icon: <ShieldIcon size={18} />, title: t.perkWarrantyTitle, text: t.perkWarrantyText },
            { icon: <BoxIcon size={18} />, title: t.perkDownloadTitle, text: t.perkDownloadText },
          ].map((f) => (
            <div key={f.title} className="flex items-center gap-3 rounded-xl bg-white p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">{f.icon}</span>
              <div>
                <p className="text-sm font-semibold">{f.title}</p>
                <p className="text-xs text-zinc-500">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      <SiteFooter />
      <SiteSupport />
    </div>
  );
}

function StockCount({ stock, t }: { stock: number; t: Dictionary['shop'] }) {
  if (stock <= 0) return <span className="font-medium text-red-600">{t.outOfStock}</span>;
  return <span className={`tabular-nums ${stock < LOW_STOCK ? 'font-medium text-amber-700' : 'text-zinc-900'}`}>{fmt(t.pcs, { n: stock.toLocaleString('en-US') })}</span>;
}
