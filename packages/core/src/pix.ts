// Nạp PIX (Brazil) qua API cổng thanh toán (Admin > Cổng nạp tiền > PIX).
// Link API chỉ lưu trong cấu hình trên server (payment.pix, isSecret), không nằm trong code, không gửi ra trình duyệt.
//  - Tạo lệnh: GET createUrl với {amount} = số R$  -> { data: { transactionId, amount, paymentValue (mã PIX copia e cola), expiresAt, status } }
//  - Kiểm tra (tùy chọn): GET statusUrl với {id} = transactionId -> đọc data.status / status; trạng thái "đã trả" thì tự cộng tiền
//  - Callback: web gửi kèm callbackUrl=<web>/api/webhooks/pix?ref=<mã bí mật riêng từng lệnh> (hoặc thay {callback} trong link).
//    Cổng gọi link này khi khách trả xong -> tự cộng tiền. Mã chỉ lưu dạng băm (sha256) -> không ai đoán / giả được.
//  - Không có cả 2: khách gửi biên lai, admin duyệt như chuyển khoản
import { createHash, randomBytes } from 'node:crypto';
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

type PixMeta = { pix: { transactionId: string; code: string; providerStatus?: string; checkedAt?: string; cbHash?: string; callback?: string } };

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

// Gắn link callback vào link tạo lệnh: có {callback} thì thay, chưa có callbackUrl thì thêm ?callbackUrl= / &callbackUrl=
function withCallback(url: string, cb: string) {
  const enc = encodeURIComponent(cb);
  if (url.includes('{callback}')) return url.replaceAll('{callback}', enc);
  if (/[?&]callbackUrl=/i.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}callbackUrl=${enc}`;
}

async function callApi(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' }, cache: 'no-store' });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`PIX API trả về không phải JSON (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const msg = (body as { message?: unknown } | null)?.message;
    throw new Error(`PIX API lỗi HTTP ${res.status}${typeof msg === 'string' ? `: ${msg.slice(0, 100)}` : ''}`);
  }
  return (body ?? {}) as Record<string, unknown>;
}

const pick = (o: Record<string, unknown>) => ((o.data && typeof o.data === 'object' ? o.data : o) as Record<string, unknown>);
const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

export async function createPixDeposit(userId: string, input: { amount: string }, opts: { callbackBase?: string } = {}) {
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

  // Mã bí mật riêng cho lệnh này: cổng PIX gọi lại đúng link có mã -> biết lệnh nào đã trả
  const cbToken = opts.callbackBase ? randomBytes(24).toString('base64url') : '';
  const base = s.createUrl.replaceAll('{amount}', original.toString());
  const url = cbToken ? withCallback(base, `${opts.callbackBase}/api/webhooks/pix?ref=${cbToken}`) : base;
  let data: Record<string, unknown>;
  try {
    data = pick(await callApi(url));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[pix] create failed', msg);
    // Cổng PIX có mức tối thiểu riêng (VD 7max: 100 R$) -> báo rõ cho khách thay vì "tạm thời không dùng được"
    if (/belowMinimum|below.?min|minimum/i.test(msg)) throw domainError(400, 'This amount is below the PIX minimum. Please enter a higher amount.');
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

  const meta: PixMeta = { pix: { transactionId, code, providerStatus: str(data.status), ...(cbToken && { cbHash: sha256(cbToken) }) } };
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

/** Cổng PIX gọi lại (callbackUrl) khi lệnh thay đổi trạng thái. ref = mã bí mật của lệnh. */
export async function handlePixCallback(ref: string, payload: Record<string, unknown>): Promise<{ ok: boolean; status?: string; reason?: string }> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(ref)) return { ok: false, reason: 'bad ref' };
  const t = await prisma.transaction.findFirst({
    where: { type: 'DEPOSIT', method: 'PIX', metadata: { path: ['pix', 'cbHash'], equals: sha256(ref) } },
  });
  if (!t) return { ok: false, reason: 'not found' };
  const meta = (t.metadata ?? {}) as PixMeta;
  const data = pick(payload);
  // Lưu lại nội dung callback (rút gọn) để admin / kỹ thuật xem cổng gửi gì
  const raw = JSON.stringify(payload).slice(0, 1000);
  console.log(`[pix] callback ${t.id}: ${raw}`);
  if (t.status === 'COMPLETED') return { ok: true, status: t.status };
  if (!(t.status === 'PENDING' || t.status === 'EXPIRED')) return { ok: true, status: t.status };

  const txId = str(data.transactionId ?? data.id ?? data.txid);
  if (txId && meta.pix?.transactionId && txId !== meta.pix.transactionId) {
    console.error(`[pix] callback ${t.id}: transactionId mismatch ${txId}`);
    return { ok: false, reason: 'transaction mismatch' };
  }
  const status = str(data.status ?? data.paymentStatus ?? data.state ?? payload.status);
  const paidFlag = data.paid === true || data.paid === 'true' || data.success === true;
  const save = (extra: Partial<PixMeta['pix']>) =>
    prisma.transaction.updateMany({ where: { id: t.id, status: { in: ['PENDING', 'EXPIRED'] } }, data: { metadata: { ...meta, pix: { ...meta.pix, ...extra } } as Prisma.InputJsonValue } });

  if (PAID.test(status) || (!status && paidFlag)) {
    const paid = Number(data.amount ?? data.paidAmount ?? data.value);
    if (Number.isFinite(paid) && paid > 0 && paid + 0.009 < Number(t.originalAmount)) {
      console.error(`[pix] callback ${t.id}: paid less than requested: ${paid}`);
      await save({ providerStatus: status, callback: raw });
      return { ok: true, status: t.status, reason: 'underpaid, admin review' }; // trả thiếu -> để admin xem tay
    }
    try {
      await prisma.$transaction((tx) => creditDeposit(tx, t.id, { metadata: { ...meta, pix: { ...meta.pix, providerStatus: status || 'paid', checkedAt: new Date().toISOString(), callback: raw } } }));
      void notifyDeposit(t.id).catch(() => {});
      return { ok: true, status: 'COMPLETED' };
    } catch {
      const now = await prisma.transaction.findUnique({ where: { id: t.id }, select: { status: true } });
      return { ok: true, status: now?.status };
    }
  }
  if (FAILED.test(status) && t.status === 'PENDING' && !t.claimedAt) {
    await prisma.transaction.updateMany({ where: { id: t.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
    return { ok: true, status: 'EXPIRED' };
  }
  // Trạng thái chưa rõ: chỉ ghi lại, không cộng tiền
  await save({ providerStatus: status, callback: raw });
  return { ok: true, status: t.status, reason: 'status not paid' };
}

/** Lệnh PIX này có tự cộng tiền không (cổng có link kiểm tra, hoặc lệnh đã gửi kèm callback) */
export const pixAutoCredit = (s: PixSettings, metadata?: unknown) =>
  s.statusUrl.includes('{id}') || !!((metadata as PixMeta | null)?.pix?.cbHash);
