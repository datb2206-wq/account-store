import Link from 'next/link';
import { getI18n } from '@/i18n/server';
import { STAFF_ROLES, type CurrentUser } from '@/lib/auth';
import { contactHref } from '@/lib/contact';
import { formatUsd } from '@/lib/format';
import { getCategoryMenu } from '@/lib/category-menu';
import { getSiteConfig } from '@/lib/site';
import { buildHref } from '@/lib/url';
import { AnnouncementBar } from './announcement-bar';
import { ContactLink } from './contact-link';
import { CodeIcon, ReceiptIcon, StoreIcon, WalletIcon } from './icons';
import { Logo } from './logo';
import { LogoutButton } from './logout-button';
import { CategoryBarScroller } from './shop/category-bar';
import { CategoryIcon } from './shop/category-icon';
import { CategoryMenu } from './shop/category-menu';

// Ô tìm kiếm lớn: GET về trang chủ (?q=), hoạt động cả khi chưa có JS
function SearchForm({ q, placeholder, label, className = '' }: { q: string; placeholder: string; label: string; className?: string }) {
  return (
    <form action="/" role="search" className={`flex h-12 items-center rounded-xl border border-zinc-300 bg-zinc-50 p-1 pl-4 transition focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/20 ${className}`}>
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        aria-label={label}
        enterKeyHint="search"
        className="h-full min-w-0 flex-1 bg-transparent pr-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
      />
      <button className="h-full rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500">{label}</button>
    </form>
  );
}

// q: từ khóa đang tìm (trang chủ truyền vào để ô tìm kiếm giữ nguyên nội dung)
// category: slug danh mục đang chọn, để tô sáng tab tương ứng
export async function SiteHeader({ user, q = '', category }: { user: CurrentUser | null; q?: string; category?: string }) {
  const [site, { locale, d }] = await Promise.all([getSiteConfig(), getI18n()]);
  const menu = await getCategoryMenu(locale);
  const h = d.header;
  const action = 'hidden h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold whitespace-nowrap transition xl:inline-flex';
  const outline = 'h-11 rounded-lg border border-zinc-300 bg-white px-4 font-semibold text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50';

  return (
    <>
      <AnnouncementBar />
      {/* Điện thoại: header không dính để 3 hàng không che mất nội dung. Mega menu định vị theo thẻ này */}
      <header className="relative top-0 z-30 border-b border-zinc-200 bg-white md:sticky">
        <div className="site-container flex h-16 items-center gap-3 md:h-[78px] lg:gap-5">
          <Logo name={site.name} logoUrl={site.logoUrl} compact />
          <SearchForm q={q} placeholder={h.searchPlaceholder} label={h.search} className="hidden min-w-0 flex-1 md:flex" />

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ContactLink href={contactHref(site.resellerApiUrl)} title={h.resellerApi} className={`${action} bg-orange-600 text-white hover:bg-orange-700`}>
              <CodeIcon size={16} /> {h.resellerApi}
            </ContactLink>
            <ContactLink href={contactHref(site.supplierContact)} title={h.becomeSupplier} className={`${action} border border-zinc-300 text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50`}>
              <StoreIcon size={16} /> {h.becomeSupplier}
            </ContactLink>
            {user ? (
              <>
                <Link href="/dashboard/orders" className="btn-ghost px-2" aria-label={h.orders} title={h.orders}>
                  <ReceiptIcon size={18} />
                </Link>
                {STAFF_ROLES.includes(user.role) && <Link href="/admin" className="btn-ghost hidden lg:inline-flex">{h.admin}</Link>}
                <Link
                  href="/dashboard/deposit"
                  className="flex h-11 items-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 tabular-nums ring-1 ring-emerald-600/15 hover:bg-emerald-100"
                  title={h.balanceHint}
                >
                  <WalletIcon size={15} />
                  {formatUsd(user.balance)}
                  <span className="ml-0.5 text-emerald-500">+</span>
                </Link>
                <Link href="/dashboard" className="hidden max-w-36 truncate text-sm font-medium text-zinc-600 hover:text-zinc-900 2xl:inline">
                  {user.username ?? user.email}
                </Link>
                <LogoutButton label={h.signOut} compact />
              </>
            ) : (
              <>
                <Link href="/login" className={`btn-ghost ${outline}`}>{h.signIn}</Link>
                <Link href="/register" className="btn-buy h-11 px-5 shadow-sm">{h.signUp}</Link>
              </>
            )}
          </div>
        </div>

        {/* Điện thoại / tablet dọc: ô tìm kiếm xuống hàng riêng, rộng hết màn hình */}
        <div className="site-container pb-3 md:hidden">
          <SearchForm q={q} placeholder={h.searchPlaceholder} label={h.search} />
        </div>

        {/* Hàng danh mục: nút mega menu + dải tab cuộn ngang */}
        <div className="border-t border-zinc-200">
          <div className="site-container flex items-center gap-3 py-1.5 lg:gap-5">
            <CategoryMenu total={menu.total} columns={menu.columns} />
            <nav aria-label={d.menu.categories} className="min-w-0 flex-1">
              <CategoryBarScroller label={d.menu.categories}>
                {menu.columns.map((c) => (
                  <Link
                    key={c.key}
                    href={buildHref('/', { category: c.slug })}
                    role="listitem"
                    aria-current={c.slug === category || c.items.some((i) => i.slug === category) ? 'page' : undefined}
                    className="flex h-9 shrink-0 items-center gap-2.5 border-r border-zinc-200 px-4 text-sm font-semibold whitespace-nowrap text-zinc-900 transition-colors first:pl-1 last:border-r-0 hover:text-orange-600 aria-[current=page]:text-orange-600"
                  >
                    <CategoryIcon name={c.name} slug={c.slug} iconUrl={c.iconUrl} size="sm" />
                    {c.name}
                  </Link>
                ))}
              </CategoryBarScroller>
            </nav>
          </div>
        </div>
      </header>
    </>
  );
}
