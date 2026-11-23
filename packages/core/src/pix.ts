// Nạp PIX (Brazil) qua API cổng thanh toán (Admin > Cổng nạp tiền > PIX).
// Link API chỉ lưu trong cấu hình trên server (payment.pix, isSecret), không nằm trong code, không gửi ra trình duyệt.
//  - Tạo lệnh: GET createUrl với {amount} = số R$  -> { data: { transactionId, amount, paymentValue (mã PIX copia e cola), expiresAt, status } }
//  - Kiểm tra (tùy chọn): GET statusUrl với {id} = transactionId -> đọc data.status / status; trạng thái "đã trả" thì tự cộng tiền
//  - Không có statusUrl: khách bấm "Tôi đã thanh toán", admin duyệt như chuyển khoản
import { Prisma, prisma } from '@accszone/database';
import { CONFIG_SCHEMAS, getConfig, type ConfigValue } from './config';
import { creditDeposit, expireStaleDeposits } from './deposits';
import { domainError } from './errors';
import { notifyDeposit } from './telegram';

export type PixSettings = ConfigValue<'payment.pix'>;

export const PIX_DEFAULTS: PixSettings = { enabled: false, name: 'PIX', createUrl: '', statusUrl: '', currency: 'BRL', minAmount: 10, maxAmount: 0 };

const TIMEOUT_MS = 15_000;
const MAX_PENDING = 3;
const PAID = /^(paid|approved|completed?|success|succeeded|confirmed|done|pago|aprovado|concluido|concluída|concluida)$/i;
const FAILED = /^(failed|canceled|cancelled|expired|rejected|refused|error|cancelado|expirado|recusado)$/i;

export async function getPixSettings(): Promise<PixSettings> {
  const row = await prisma.systemConfig.findUnique({ where: { key: 'payment.pix' } });
  const parsed = CONFIG_SCHEMAS['payment.pix'].safeParse(row?.value);
  return parsed.success ? parsed.data : PIX_DEFAULTS;
}

export const pixReady = (s: PixSettings) => s.enabled && s.createUrl.includes('{amount}');

type PixMeta = { pix: { transactionId: string; code: string; providerStatus?: string; checkedAt?: string } };

async function callApi(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' }, cache: 'no-store' });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`PIX API trả về không phải JSON (HTTP ${res.status})`);
  }
  if (!res.ok) throw new Error(`PIX API lỗi HTTP ${res.status}`);
  return (body ?? {}) as Record<string, unknown>;
}

const pick = (o: Record<string, unknown>) => ((o.data && typeof o.data === 'object' ? o.data : o) as Record<string, unknown>);
const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

export async function createPixDeposit(userId: string, input: { amount: string }) {
  const s = await getPixSettings();
  if (!pixReady(s)) throw domainError(400, 'PIX deposits are currently unavailable');
  const rate = (await getConfig('currency.rates'))[s.currency];
  if (!rate) throw domainError(400, `Exchange rate for ${s.currency} is not configured`);

  const original = new Prisma.Decimal(input.amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  if (original.lt(s.minAmount)) throw domainError(400, `Minimum PIX deposit is ${s.minAmount} ${s.currency}`);
  if (s.maxAmount > 0 && original.gt(s.maxAmount)) throw domainError(400, `Maximum PIX deposit is ${s.maxAmount} ${s.currency}`);

  await expireStaleDeposits();
  const pending = await prisma.transaction.count({ where: { userId, type: 'DEPOSIT', method: 'PIX', status: 'PENDING', claimedAt: null } });
  if (pending >= MAX_PENDING) throw domainError(429, `You already have ${pending} pending PIX payments. Pay them or wait until they expire.`);

  let data: Record<string, unknown>;
  try {
    data = pick(await callApi(s.createUrl.replaceAll('{amount}', original.toString())));
  } catch (err) {
    console.error('[pix] create failed', err instanceof Error ? err.message : err);
    throw domainError(502, 'PIX is temporarily unavailable, please try again later');
  }
  const transactionId = str(data.transactionId ?? data.id ?? data.txid);
  const code = str(data.paymentValue ?? data.qrCode ?? data.pixCode ?? data.copyPaste);
  if (!transactionId || !code.startsWith('000201')) {
    console.error('[pix] unexpected response', JSON.stringify(data).slice(0, 300));
    throw domainError(502, 'PIX is temporarily unavailable, please try again later');
  }
  const returned = Number(data.amount);
  if (Number.isFinite(returned) && returned > 0 && Math.abs(returned - original.toNumber()) > 0.009) {
    console.error(`[pix] amount mismatch: asked ${original} got ${returned}`);
    throw domainError(502, 'PIX is temporarily unavailable, please try again later');
  }
  // Chống trùng: 1 mã giao dịch PIX chỉ gắn với đúng 1 lệnh nạp trên web
  if (await prisma.transaction.count({ where: { bankRef: `pix:${transactionId}` } })) {
    console.error(`[pix] duplicate transactionId ${transactionId}`);
    throw domainError(502, 'PIX is temporarily unavailable, please try again later');
  }
  const exp = new Date(str(data.expiresAt));
  const expiresAt = Number.isNaN(exp.getTime()) ? new Date(Date.now() + 30 * 60_000) : exp;

  const meta: PixMeta = { pix: { transactionId, code, providerStatus: str(data.status) } };
  return prisma.transaction.create({
    data: {
      userId,
      type: 'DEPOSIT',
      method: 'PIX',
      status: 'PENDING',
      amount: original.div(rate).toDecimalPlaces(6, Prisma.Decimal.ROUND_DOWN).toFixed(6),
      originalAmount: original.toFixed(6),
      originalCurrency: s.currency,
      exchangeRate: String(rate),
      bankRef: `pix:${transactionId}`,
      expiresAt,
      metadata: meta,
    },
    select: { id: true },
  });
}

/** Hỏi cổng PIX trạng thái 1 lệnh; đã trả thì cộng tiền. Trả về trạng thái hiện tại của giao dịch. */
export async function checkPixDeposit(id: string) {
  const s = await getPixSettings();
  const t = await prisma.transaction.findFirst({ where: { id, type: 'DEPOSIT', method: 'PIX' } });
  if (!t) return null;
  if (!s.statusUrl.includes('{id}') || !(t.status === 'PENDING' || t.status === 'EXPIRED')) return t.status;
  // Lệnh hết hạn quá 24h thì thôi không hỏi nữa
  if (t.status === 'EXPIRED' && t.createdAt.getTime() < Date.now() - 24 * 3600_000) return t.status;
  const meta = (t.metadata ?? {}) as PixMeta;
  if (!meta.pix?.transactionId) return t.status;

  let data: Record<string, unknown>;
  try {
    data = pick(await callApi(s.statusUrl.replaceAll('{id}', encodeURIComponent(meta.pix.transactionId))));
  } catch (err) {
    console.error('[pix] status failed', err instanceof Error ? err.message : err);
    return t.status;
  }
  const status = str(data.status ?? data.paymentStatus ?? data.state);
  if (PAID.test(status)) {
    const paid = Number(data.amount ?? data.paidAmount);
    if (Number.isFinite(paid) && paid > 0 && paid + 0.009 < Number(t.originalAmount)) {
      console.error(`[pix] ${id} paid less than requested: ${paid}`);
      return t.status; // trả thiếu -> để admin xem tay
    }
    try {
      await prisma.$transaction((tx) => creditDeposit(tx, id, { metadata: { pix: { ...meta.pix, providerStatus: status, checkedAt: new Date().toISOString() } } }));
      void notifyDeposit(id).catch(() => {});
      return 'COMPLETED';
    } catch {
      return (await prisma.transaction.findUnique({ where: { id }, select: { status: true } }))?.status ?? t.status;
    }
  }
  if (FAILED.test(status) && t.status === 'PENDING' && !t.claimedAt) {
    await prisma.transaction.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
    return 'EXPIRED';
  }
  return t.status;
}

/** Worker: kiểm tra các lệnh PIX đang chờ (tạo trong 24h gần nhất) */
export async function sweepPixDeposits() {
  const s = await getPixSettings();
  if (!s.statusUrl.includes('{id}')) return { checked: 0, completed: 0 };
  const rows = await prisma.transaction.findMany({
    where: { type: 'DEPOSIT', method: 'PIX', status: { in: ['PENDING', 'EXPIRED'] }, createdAt: { gt: new Date(Date.now() - 3 * 3600_000) } },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  let completed = 0;
  for (const r of rows) if ((await checkPixDeposit(r.id)) === 'COMPLETED') completed++;
  return { checked: rows.length, completed };
}
