// Bộ lọc giao dịch dùng chung cho trang Admin > Giao dịch và file CSV xuất ra (cùng điều kiện -> cùng kết quả).
import type { PaymentMethod, Prisma, TransactionStatus, TransactionType } from '@accszone/database';

export const TX_TYPES: TransactionType[] = ['DEPOSIT', 'PURCHASE', 'REFUND', 'ADJUSTMENT'];
export const TX_STATUSES: TransactionStatus[] = ['PENDING', 'COMPLETED', 'REJECTED', 'EXPIRED'];
export const TX_METHODS: PaymentMethod[] = ['BANK_TRANSFER', 'USDT_TRC20', 'USDT_BEP20', 'BALANCE', 'MANUAL'];
// "USDT" = cả 2 mạng, dùng cho log đối soát TxID
export type MethodFilter = PaymentMethod | 'USDT';

export interface TxFilters {
  type?: TransactionType;
  status?: TransactionStatus;
  method?: MethodFilter;
  q: string;
  from?: string; // YYYY-MM-DD, tính theo giờ máy chủ (giống cột thời gian hiển thị)
  to?: string;
  tx?: '1'; // chỉ giao dịch đã gắn TxID
}

type Params = Partial<Record<string, string>>;

const pick = <T extends string>(list: readonly T[], v?: string) => list.find((x) => x === v);
const day = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined);

export function parseTxFilters(sp: Params): TxFilters {
  return {
    type: pick(TX_TYPES, sp.type),
    status: pick(TX_STATUSES, sp.status),
    method: sp.method === 'USDT' ? 'USDT' : pick(TX_METHODS, sp.method),
    q: sp.q?.trim() ?? '',
    from: day(sp.from),
    to: day(sp.to),
    tx: sp.tx === '1' ? '1' : undefined,
  };
}

export function txWhere(f: TxFilters): Prisma.TransactionWhereInput {
  const createdAt = {
    ...(f.from && { gte: new Date(`${f.from}T00:00:00`) }),
    // "đến ngày" tính trọn ngày đó
    ...(f.to && { lt: new Date(new Date(`${f.to}T00:00:00`).getTime() + 24 * 3600_000) }),
  };
  return {
    type: f.type,
    status: f.status,
    method: f.method === 'USDT' ? { in: ['USDT_TRC20', 'USDT_BEP20'] } : f.method,
    ...(f.tx && { txHash: { not: null } }),
    ...((f.from || f.to) && { createdAt }),
    ...(f.q && {
      OR: [
        { id: f.q },
        { transferCode: f.q.toUpperCase() },
        { txHash: f.q.toLowerCase() },
        { fromAddress: f.q },
        { bankRef: f.q },
        { order: { code: f.q.toUpperCase() } },
        { user: { email: { contains: f.q, mode: 'insensitive' } } },
      ],
    }),
  };
}

// Tham số URL giữ nguyên bộ lọc (bỏ giá trị trống)
export const txQuery = (f: TxFilters) => ({ type: f.type, status: f.status, method: f.method, q: f.q || undefined, from: f.from, to: f.to, tx: f.tx });
