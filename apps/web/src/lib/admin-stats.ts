import { Prisma, prisma } from '@accszone/database';

// Thống kê admin tính theo giờ Việt Nam (UTC+7, không có giờ mùa hè), không theo giờ máy chủ.
const OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

/** Ngày/tháng/năm theo giờ VN của 1 thời điểm */
export function vnParts(date = new Date()) {
  const d = new Date(date.getTime() + OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate(), weekday: (d.getUTCDay() + 6) % 7 };
}

/** Mốc 00:00 giờ VN (trả về Date UTC thật) */
export function vnDate(y: number, m: number, day = 1) {
  return new Date(Date.UTC(y, m, day) - OFFSET_MS);
}

/** Bộ lọc ngày ?from=YYYY-MM-DD&to=YYYY-MM-DD (giờ VN, "to" tính hết ngày) -> điều kiện Prisma */
export function vnDayRange(from?: string, to?: string) {
  const parse = (s?: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
    return m ? vnDate(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
  };
  const gte = parse(from);
  const end = parse(to);
  if (!gte && !end) return undefined;
  return { gte, lt: end ? new Date(end.getTime() + DAY_MS) : undefined };
}

export function periodStarts(now = new Date()) {
  const { y, m, day, weekday } = vnParts(now);
  const today = vnDate(y, m, day);
  return { today, week: new Date(today.getTime() - weekday * DAY_MS), month: vnDate(y, m) };
}

// Đơn hoàn tất: tiền thực thu = tổng đơn − tiền đã hoàn 1 phần; giá vốn = giá vốn lúc mua (đơn cũ chưa lưu thì lấy giá vốn hiện tại)
export const ORDER_REFUNDS_JOIN = Prisma.sql`LEFT JOIN (
  SELECT "orderId", sum(amount) AS refund FROM transactions
  WHERE type = 'REFUND' AND status = 'COMPLETED' AND "orderId" IS NOT NULL GROUP BY "orderId"
) r ON r."orderId" = o.id`;
export const NET_REVENUE = Prisma.sql`(o."totalAmount" - coalesce(r.refund, 0))`;
export const ORDER_COST = Prisma.sql`(o.quantity * coalesce(o."unitCost", p."costPrice", 0))`;

export interface PeriodStats {
  users: number;
  orders: number;
  revenue: number;
  profit: number;
}

// Lợi nhuận = tiền thực thu đơn hoàn tất − giá vốn × số lượng (sản phẩm không khai giá vốn được tính vốn 0)
export async function periodStats(from?: Date): Promise<PeriodStats> {
  const since = from ?? new Date(0);
  const [users, rows] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.$queryRaw<{ orders: number; revenue: string; cost: string }[]>(Prisma.sql`
      SELECT count(*)::int AS orders,
             coalesce(sum(${NET_REVENUE}), 0)::text AS revenue,
             coalesce(sum(${ORDER_COST}), 0)::text AS cost
      FROM orders o JOIN products p ON p.id = o."productId" ${ORDER_REFUNDS_JOIN}
      WHERE o.status = 'COMPLETED' AND o."createdAt" >= ${since}`),
  ]);
  const r = rows[0]!;
  const revenue = Number(r.revenue);
  return { users, orders: r.orders, revenue, profit: revenue - Number(r.cost) };
}

export interface DailyPoint {
  day: number;
  revenue: number;
  profit: number;
  deposit: number;
}

/** Doanh thu, lợi nhuận và tiền nạp theo từng ngày của 1 tháng (m: 0-11) */
export async function monthlySeries(y: number, m: number): Promise<DailyPoint[]> {
  const from = vnDate(y, m);
  const to = vnDate(y, m + 1);
  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS);
  const [orders, deposits] = await Promise.all([
    prisma.$queryRaw<{ d: number; revenue: string; cost: string }[]>(Prisma.sql`
      SELECT extract(day FROM o."createdAt" + interval '7 hours')::int AS d,
             sum(${NET_REVENUE})::text AS revenue,
             sum(${ORDER_COST})::text AS cost
      FROM orders o JOIN products p ON p.id = o."productId" ${ORDER_REFUNDS_JOIN}
      WHERE o.status = 'COMPLETED' AND o."createdAt" >= ${from} AND o."createdAt" < ${to}
      GROUP BY 1`),
    prisma.$queryRaw<{ d: number; amount: string }[]>(Prisma.sql`
      SELECT extract(day FROM "createdAt" + interval '7 hours')::int AS d, sum(amount)::text AS amount
      FROM transactions
      WHERE type = 'DEPOSIT' AND status = 'COMPLETED' AND "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY 1`),
  ]);
  const series = Array.from({ length: days }, (_, i) => ({ day: i + 1, revenue: 0, profit: 0, deposit: 0 }));
  for (const o of orders) {
    const p = series[o.d - 1];
    if (p) {
      p.revenue = Number(o.revenue);
      p.profit = Number(o.revenue) - Number(o.cost);
    }
  }
  for (const t of deposits) {
    const p = series[t.d - 1];
    if (p) p.deposit = Number(t.amount);
  }
  return series;
}
