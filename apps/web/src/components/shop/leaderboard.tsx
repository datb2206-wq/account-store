import { prisma } from '@accszone/database';
import { TrophyIcon } from '@/components/icons';
import { fmt } from '@/i18n/config';
import type { Dictionary } from '@/i18n/dictionaries';
import { cached } from '@/lib/cache';
import { formatUsd } from '@/lib/format';
import type { SiteExtras } from '@/lib/site-extras';

const TTL_SEC = 300;

// "datb2206@gmail.com" -> "da******@gmail.com": không lộ email khách
export function maskEmail(email: string) {
  const [name = '', domain = ''] = email.split('@');
  const keep = name.length <= 3 ? 1 : 2;
  return `${name.slice(0, keep)}${'*'.repeat(Math.max(3, name.length - keep))}@${domain}`;
}

function since(period: SiteExtras['leaderboard']['period']) {
  const now = new Date();
  if (period === 'week') return new Date(now.getTime() - 7 * 86_400_000);
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  return undefined;
}

// Bảng xếp hạng người mua theo tổng tiền đơn đã hoàn tất: chỉ dữ liệu thật, cache 5 phút
export async function Leaderboard({ config, d }: { config: SiteExtras['leaderboard']; d: Dictionary }) {
  const rows = await cached(`shop:leaderboard:${config.period}:${config.size}`, TTL_SEC, async () => {
    const from = since(config.period);
    const groups = await prisma.order.groupBy({
      by: ['userId'],
      where: { status: 'COMPLETED', ...(from && { createdAt: { gte: from } }) },
      _sum: { totalAmount: true },
      _count: true,
      orderBy: { _sum: { totalAmount: 'desc' } },
      take: config.size,
    });
    const users = await prisma.user.findMany({ where: { id: { in: groups.map((g) => g.userId) } }, select: { id: true, email: true } });
    const email = new Map(users.map((u) => [u.id, u.email]));
    return groups.map((g) => ({ name: maskEmail(email.get(g.userId) ?? '?'), total: g._sum.totalAmount?.toString() ?? '0', orders: g._count }));
  });
  if (rows.length === 0) return null;
  const period = { week: d.extras.periodWeek, month: d.extras.periodMonth, all: d.extras.periodAll }[config.period];
  const medal = ['bg-amber-400 text-white', 'bg-zinc-400 text-white', 'bg-orange-400 text-white'];

  return (
    <section className="rounded-xl bg-white p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 font-bold text-zinc-900">
        <TrophyIcon size={18} className="text-amber-500" />
        {d.extras.leaderboardTitle}
        <span className="text-xs font-normal text-zinc-500">· {period}</span>
      </h2>
      <ol className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-3 border-b border-zinc-100 py-2 text-sm last:border-0">
            <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${medal[i] ?? 'bg-zinc-100 text-zinc-500'}`}>{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-medium text-zinc-700" translate="no">{r.name}</span>
            <span className="text-xs text-zinc-400">{fmt(d.extras.ordersCount, { n: r.orders })}</span>
            <span className="font-semibold text-zinc-900 tabular-nums" translate="no">{formatUsd(r.total)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
