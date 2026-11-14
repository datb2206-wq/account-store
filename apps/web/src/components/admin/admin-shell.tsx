'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BoxIcon, CartIcon, ChevronIcon, CoinIcon, ClockIcon, CloseIcon, GiftIcon, GlobeIcon, GridIcon, ImageIcon, KeyIcon, LogoutIcon, MailIcon, ReceiptIcon, ShieldIcon, SparklesIcon, UsersIcon, WalletIcon,
} from '@/components/icons';
import { requiredPermission } from '@/lib/permissions';

type Leaf = { label: string; href: string; badge?: number; badgeTone?: 'amber' | 'red' };
type Item = Leaf & { icon: React.ComponentType<{ size?: number; className?: string }>; children?: Leaf[] };
type Section = { title: string; items: Item[] };

export interface ShellProps {
  siteName: string;
  email: string;
  role: string;
  pendingDeposits: number;
  stuckOrders: number;
  // Quyền thực tế của người đang đăng nhập (đã tính Super Admin / vai trò): menu ẩn mục không có quyền
  permissions: string[];
  roleName?: string;
  logoDarkUrl?: string;
  avatarUrl?: string;
  children: React.ReactNode;
}

// Toàn bộ menu; filterMenu() bỏ những mục người đang đăng nhập không có quyền
function buildMenu({ pendingDeposits, stuckOrders }: Pick<ShellProps, 'pendingDeposits' | 'stuckOrders'>): Section[] {
  return [
    { title: 'Main', items: [{ label: 'Dashboard', href: '/admin', icon: GridIcon }] },
    {
      title: 'Lịch sử',
      items: [
        {
          label: 'Lịch sử', href: '/admin/activity', icon: ClockIcon,
          children: [
            { label: 'Nhật ký hoạt động', href: '/admin/activity' },
            { label: 'Biến động số dư', href: '/admin/balance-logs' },
          ],
        },
      ],
    },
    { title: 'Bảo mật', items: [{ label: 'Block IP', href: '/admin/block-ip', icon: CloseIcon }] },
    {
      title: 'Dịch vụ',
      items: [
        {
          label: 'Sản phẩm', href: '/admin/products', icon: CartIcon, badge: stuckOrders, badgeTone: 'red',
          children: [
            { label: 'Chuyên mục', href: '/admin/categories' },
            { label: 'Tất cả sản phẩm', href: '/admin/products' },
            { label: 'Kết nối API', href: '/admin/suppliers' },
            { label: 'Đơn hàng', href: '/admin/orders', badge: stuckOrders, badgeTone: 'red' },
            { label: 'Tài khoản đã bán', href: '/admin/stock/sold' },
            { label: 'Tài khoản trong kho', href: '/admin/stock' },
          ],
        },
      ],
    },
    {
      title: 'Quản lý',
      items: [
        { label: 'Thành viên', href: '/admin/users', icon: UsersIcon },
        { label: 'Admin Role', href: '/admin/roles', icon: ShieldIcon },
        {
          label: 'Nạp tiền', href: '/admin/transactions', icon: WalletIcon, badge: pendingDeposits, badgeTone: 'amber',
          children: [
            { label: 'Chờ duyệt', href: '/admin/transactions?type=DEPOSIT&status=PENDING', badge: pendingDeposits, badgeTone: 'amber' },
            { label: 'Lịch sử nạp tiền', href: '/admin/transactions?type=DEPOSIT' },
            { label: 'Log TxID USDT', href: '/admin/transactions?method=USDT&tx=1' },
            { label: 'Tất cả giao dịch', href: '/admin/transactions' },
          ],
        },
        { label: 'Mã giảm giá', href: '/admin/coupons', icon: GiftIcon },
        { label: 'Khuyến mãi nạp tiền', href: '/admin/promotions', icon: SparklesIcon },
        {
          label: 'Bài viết', href: '/admin/blog', icon: MailIcon,
          children: [
            { label: 'Viết bài mới', href: '/admin/blog/new' },
            { label: 'Tất cả bài viết', href: '/admin/blog' },
            { label: 'Chuyên mục', href: '/admin/blog/categories' },
          ],
        },
      ],
    },
    {
      title: 'Cài đặt hệ thống',
      items: [
        { label: 'Ngôn ngữ', href: '/admin/translations', icon: GlobeIcon },
        { label: 'Tiền tệ', href: '/admin/currencies', icon: CoinIcon },
        { label: 'Giao diện', href: '/admin/theme', icon: ImageIcon },
        { label: 'Cài đặt', href: '/admin/settings', icon: KeyIcon },
      ],
    },
  ];
}

const pathOf = (href: string) => href.split('?')[0]!;

// Mục đang mở = mục có đường dẫn khớp DÀI NHẤT (để /admin/stock/sold không làm sáng cả /admin/stock)
function activeHref(pathname: string, menu: Section[]) {
  const all = menu.flatMap((s) => s.items.flatMap((i) => [i, ...(i.children ?? [])]));
  let best = '';
  for (const { href } of all) {
    const p = pathOf(href);
    const hit = p === '/admin' ? pathname === '/admin' : pathname === p || pathname.startsWith(`${p}/`);
    if (hit && p.length > pathOf(best).length) best = href;
  }
  return best;
}

function Count({ n, tone = 'amber' }: { n?: number; tone?: 'amber' | 'red' }) {
  if (!n) return null;
  return <span className={`ml-auto rounded-full px-1.5 text-[10px] leading-4 font-semibold text-white ${tone === 'red' ? 'bg-red-500' : 'bg-amber-500'}`}>{n}</span>;
}

// Bỏ mục / mục con không có quyền; mục cha còn lại 0 mục con thì bỏ luôn
function filterMenu(menu: Section[], role: string, permissions: string[]): Section[] {
  const visible = (href: string) => {
    if (role === 'SUPER_ADMIN') return true;
    const perm = requiredPermission(pathOf(href));
    return perm === null || (perm !== 'deny' && permissions.includes(perm));
  };
  return menu
    .map((s) => ({
      ...s,
      items: s.items.flatMap((i) => {
        if (!i.children) return visible(i.href) ? [i] : [];
        const children = i.children.filter((c) => visible(c.href));
        return children.length ? [{ ...i, href: children[0]!.href, children }] : [];
      }),
    }))
    .filter((s) => s.items.length > 0);
}

export function AdminShell({ siteName, email, role, pendingDeposits, stuckOrders, permissions, roleName, logoDarkUrl, avatarUrl, children }: ShellProps) {
  const pathname = usePathname();
  const menu = filterMenu(buildMenu({ pendingDeposits, stuckOrders }), role, permissions);
  const active = activeHref(pathname, menu);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => setMobileOpen(false), [pathname]);

  const groupOpen = (item: Item) =>
    open[item.label] ?? !!item.children?.some((c) => pathOf(c.href) === pathOf(active));

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    window.location.href = '/login';
  }

  return (
    <div className="flex min-h-screen bg-[#f1f3f9]">
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[#111c43] text-[#a3aed1] transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'lg:hidden' : ''}`}
      >
        <Link href="/admin" className="flex h-16 shrink-0 items-center gap-2 border-b border-white/10 px-5 text-lg font-bold text-white">
          {logoDarkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoDarkUrl} alt={siteName} className="h-9 w-auto max-w-full object-contain" />
          ) : (
            <>
              <span className="grid size-8 place-items-center rounded-lg bg-indigo-500 text-sm">{siteName.slice(0, 1).toUpperCase()}</span>
              <span className="truncate">{siteName}</span>
            </>
          )}
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {menu.map((section) => (
            <div key={section.title} className="mb-3">
              <p className="px-3 pb-2 text-[10px] font-semibold tracking-widest text-[#536485] uppercase">{section.title}</p>
              {section.items.map((item) => {
                const Icon = item.icon;
                if (!item.children) {
                  const on = item.href === active;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition ${on ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white'}`}
                    >
                      <Icon size={17} className={on ? 'text-indigo-300' : 'text-[#6c7bb0]'} />
                      {item.label}
                      <Count n={item.badge} tone={item.badgeTone} />
                    </Link>
                  );
                }
                const isOpen = groupOpen(item);
                const childActive = item.children.some((c) => c.href === active);
                return (
                  <div key={item.label} className="mb-0.5">
                    <button
                      type="button"
                      onClick={() => setOpen((o) => ({ ...o, [item.label]: !isOpen }))}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition ${childActive ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white'}`}
                    >
                      <Icon size={17} className={childActive ? 'text-indigo-300' : 'text-[#6c7bb0]'} />
                      {item.label}
                      {!isOpen && <Count n={item.badge} tone={item.badgeTone} />}
                      <ChevronIcon size={14} className={`${isOpen || !item.badge ? 'ml-auto' : 'ml-1'} transition ${isOpen ? '' : '-rotate-90'}`} />
                    </button>
                    {isOpen && (
                      <div className="mt-0.5 mb-1 space-y-0.5 pl-9">
                        {item.children.map((c) => {
                          const on = c.href === active;
                          return (
                            <Link
                              key={c.href}
                              href={c.href}
                              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] transition ${on ? 'font-semibold text-white' : 'hover:text-white'}`}
                            >
                              <span className={`size-1.5 rounded-full border ${on ? 'border-white bg-white' : 'border-current'}`} />
                              {c.label}
                              <Count n={c.badge} tone={c.badgeTone} />
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-zinc-200 bg-white px-4 md:px-6">
          <button
            type="button"
            aria-label="Menu"
            onClick={() => (window.innerWidth < 1024 ? setMobileOpen((v) => !v) : setCollapsed((v) => !v))}
            className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M4 6h16M4 12h10M4 18h16" /></svg>
          </button>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link href="/" target="_blank" className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 sm:flex">
              <BoxIcon size={16} /> Xem trang web
            </Link>
            <Link href="/dashboard" className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 sm:flex">
              <ReceiptIcon size={16} /> Tài khoản của tôi
            </Link>
            <div className="mx-1 hidden h-8 w-px bg-zinc-200 sm:block" />
            <div className="flex items-center gap-2">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="size-9 rounded-full object-cover" />
              ) : (
                <span className="grid size-9 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">{email.slice(0, 1).toUpperCase()}</span>
              )}
              <div className="hidden leading-tight md:block">
                <p className="max-w-48 truncate text-sm font-medium text-zinc-800">{email}</p>
                <p className="text-[11px] text-zinc-400">{role === 'SUPER_ADMIN' ? 'Super Admin' : (roleName ?? 'Nhân viên')}</p>
              </div>
            </div>
            <button type="button" onClick={logout} title="Đăng xuất" aria-label="Đăng xuất" className="rounded-lg p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600">
              <LogoutIcon size={18} />
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">{children}</main>
        <footer className="border-t border-zinc-200 bg-white px-6 py-3 text-xs text-zinc-400">
          © {new Date().getFullYear()} {siteName} · Admin
        </footer>
      </div>
    </div>
  );
}
