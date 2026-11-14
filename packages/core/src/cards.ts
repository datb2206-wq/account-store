// Nạp thẻ cào qua đối tác đổi thẻ theo chuẩn API "chargingws/v2" (dùng chung bởi nhiều web đổi thẻ Việt Nam):
//   POST {apiUrl}/chargingws/v2  telco, code, serial, amount, request_id, partner_id, sign=md5(partner_key+code+serial), command
//   status: 1 thẻ đúng · 2 thẻ đúng nhưng sai mệnh giá · 3 thẻ lỗi · 4 bảo trì · 99 đang chờ · 100 gửi thất bại
// Kết quả cuối về qua callback (cùng chữ ký callback_sign = md5(partner_key+code+serial)).
import { createHash, timingSafeEqual } from 'node:crypto';
import { Prisma, prisma } from '@accszone/database';
import { CARD_TELCOS, CONFIG_SCHEMAS, getConfig, type CardTelco, type ConfigValue } from './config';
import { contentHash, decrypt, encrypt } from './crypto';
import { creditDeposit } from './deposits';
import { domainError } from './errors';
import { notifyDeposit } from './telegram';

export type CardSettings = ConfigValue<'payment.card'>;

export const CARD_TELCO_LABEL: Record<CardTelco, string> = {
  VIETTEL: 'Viettel',
  VINAPHONE: 'Vinaphone',
  MOBIFONE: 'Mobifone',
  VIETNAMOBILE: 'Vietnamobile',
  ZING: 'Zing',
  GATE: 'Gate',
  VCOIN: 'Vcoin',
  GARENA: 'Garena',
};

export const CARD_DEFAULTS: CardSettings = {
  enabled: false,
  apiUrl: '',
  partnerId: '',
  partnerKey: '',
  wrongValuePercent: 50,
  amounts: [10_000, 20_000, 50_000, 100_000, 200_000, 500_000],
  telcos: CARD_TELCOS.slice(0, 3).map((code) => ({ code, fee: 20, enabled: true })),
};

export async function getCardSettings(): Promise<CardSettings> {
  const row = await prisma.systemConfig.findUnique({ where: { key: 'payment.card' } });
  const parsed = CONFIG_SCHEMAS['payment.card'].safeParse(row?.value);
  return parsed.success ? parsed.data : CARD_DEFAULTS;
}

export const cardReady = (s: CardSettings) => s.enabled && !!s.apiUrl && !!s.partnerId && !!s.partnerKey && s.telcos.some((t) => t.enabled);

const md5 = (s: string) => createHash('md5').update(s).digest('hex');
const sign = (key: string, code: string, serial: string) => md5(key + code + serial);

type CardMeta = { card: { fee: number; declared: number; rate: number; wrongValuePercent: number; transId?: string; lastStatus?: number; message?: string } };

interface ProviderResult {
  status: number;
  message?: string;
  trans_id?: string | number;
  value?: string | number | null; // mệnh giá thật
  amount?: string | number | null; // số tiền đối tác trả cho shop
}

async function callProvider(s: CardSettings, fields: Record<string, string>): Promise<ProviderResult> {
  const body = new URLSearchParams({ ...fields, partner_id: s.partnerId });
  const res = await fetch(`${s.apiUrl.replace(/\/+$/, '')}/chargingws/v2`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => null)) as ProviderResult | null;
  if (!data || typeof data.status === 'undefined') throw new Error(`Card provider HTTP ${res.status}`);
  return { ...data, status: Number(data.status) };
}

// Số USD cộng cho khách theo kết quả thẻ. Đúng mệnh giá: mệnh giá khai × (1 − phí). Sai mệnh giá: mệnh giá thật × (1 − phí) × % sai mệnh giá.
function creditUsd(meta: CardMeta['card'], status: number, realValue: number) {
  const vnd = status === 1 ? meta.declared : Math.min(realValue, meta.declared) * (meta.wrongValuePercent / 100);
  return new Prisma.Decimal(vnd).mul(100 - meta.fee).div(100).div(meta.rate).toDecimalPlaces(6, Prisma.Decimal.ROUND_DOWN);
}

// Áp dụng kết quả cuối cùng (từ lúc gửi hoặc từ callback). Idempotent: chỉ xử lý khi còn PENDING.
async function settle(txId: string, r: ProviderResult, source: 'submit' | 'callback' | 'check') {
  const t = await prisma.transaction.findUnique({ where: { id: txId }, select: { status: true, metadata: true } });
  if (!t || t.status !== 'PENDING') return { status: t?.status ?? 'MISSING' };
  const meta = (t.metadata as CardMeta).card;
  const info = { ...meta, transId: r.trans_id != null ? String(r.trans_id) : meta.transId, lastStatus: r.status, message: r.message?.slice(0, 300) };

  if (r.status === 1 || r.status === 2) {
    const usd = creditUsd(meta, r.status, Number(r.value ?? 0));
    if (usd.lte(0)) {
      await prisma.transaction.updateMany({ where: { id: txId, status: 'PENDING' }, data: { status: 'REJECTED', note: 'Thẻ sai mệnh giá, giá trị nhận được bằng 0', metadata: { card: info } } });
      return { status: 'REJECTED' };
    }
    try {
      const credited = await prisma.$transaction((tx) =>
        creditDeposit(tx, txId, {
          amount: usd.toFixed(6),
          note: r.status === 2 ? `Sai mệnh giá: thẻ thật ${Number(r.value ?? 0).toLocaleString('en-US')}đ` : undefined,
          metadata: { card: { ...info, realValue: Number(r.value ?? 0), providerAmount: Number(r.amount ?? 0), via: source } },
        }),
      );
      void notifyDeposit(txId).catch(() => {});
      return { status: 'COMPLETED', amount: credited.amount };
    } catch (err) {
      if ((err as { status?: number }).status === 409) return { status: 'COMPLETED' };
      throw err;
    }
  }
  if (r.status === 99) {
    await prisma.transaction.update({ where: { id: txId }, data: { metadata: { card: info } } });
    return { status: 'PENDING' };
  }
  // 3 thẻ lỗi, 4 bảo trì, 100 gửi thất bại, mã khác: từ chối, không cộng tiền
  const reason = r.status === 3 ? 'Thẻ lỗi hoặc đã sử dụng' : r.status === 4 ? 'Hệ thống đổi thẻ đang bảo trì' : 'Gửi thẻ thất bại';
  await prisma.transaction.updateMany({
    where: { id: txId, status: 'PENDING' },
    data: { status: 'REJECTED', note: r.message ? `${reason}: ${r.message.slice(0, 200)}` : reason, metadata: { card: info } },
  });
  return { status: 'REJECTED' };
}

export async function submitCard(userId: string, input: { telco: string; amount: number; serial: string; code: string }) {
  const s = await getCardSettings();
  if (!cardReady(s)) throw domainError(400, 'Card deposits are currently unavailable');
  const telco = s.telcos.find((t) => t.enabled && t.code === input.telco);
  if (!telco) throw domainError(400, 'This card type is not supported');
  if (!s.amounts.includes(input.amount)) throw domainError(400, 'Invalid card value');
  const rate = (await getConfig('currency.rates')).VND;
  if (!rate) throw domainError(400, 'Exchange rate for VND is not configured');

  const serial = input.serial.replace(/\s+/g, '');
  const code = input.code.replace(/\s+/g, '');
  const pending = await prisma.transaction.count({ where: { userId, method: 'CARD', status: 'PENDING' } });
  if (pending >= 5) throw domainError(429, 'You already have 5 cards being processed. Please wait for them to finish.');

  const meta: CardMeta = { card: { fee: telco.fee, declared: input.amount, rate, wrongValuePercent: s.wrongValuePercent } };
  let tx: { id: string };
  try {
    tx = await prisma.transaction.create({
      data: {
        userId,
        type: 'DEPOSIT',
        method: 'CARD',
        status: 'PENDING',
        // Số dự kiến (đúng mệnh giá); số thật ghi lại lúc cộng tiền
        amount: creditUsd(meta.card, 1, input.amount).toFixed(6),
        originalAmount: String(input.amount),
        originalCurrency: 'VND',
        exchangeRate: String(rate),
        cardTelco: telco.code,
        cardSerial: serial,
        cardCode: encrypt(code),
        cardHash: contentHash(`card:${telco.code}:${serial}:${code}`),
        metadata: meta,
      },
      select: { id: true },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw domainError(409, 'This card has already been submitted');
    throw err;
  }

  let result: ProviderResult;
  try {
    result = await callProvider(s, { telco: telco.code, code, serial, amount: String(input.amount), request_id: tx.id, sign: sign(s.partnerKey, code, serial), command: 'charging' });
  } catch {
    // Không rõ đối tác đã nhận thẻ chưa -> giữ PENDING, chờ callback / admin bấm "Kiểm tra lại"
    return { id: tx.id, status: 'PENDING' };
  }
  return { id: tx.id, ...(await settle(tx.id, result, 'submit')) };
}

// Callback từ đối tác: xác thực chữ ký bằng partner_key rồi áp dụng kết quả
export async function handleCardCallback(p: Record<string, string | undefined>) {
  const s = await getCardSettings();
  if (!s.partnerKey) return { ok: false, reason: 'not configured' };
  const { request_id: id, code = '', serial = '', callback_sign: given = '' } = p;
  if (!id) return { ok: false, reason: 'missing request_id' };
  const expected = sign(s.partnerKey, code, serial);
  const a = Buffer.from(given.toLowerCase());
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'bad signature' };

  const t = await prisma.transaction.findFirst({ where: { id, method: 'CARD' }, select: { id: true, cardSerial: true, cardCode: true } });
  if (!t) return { ok: false, reason: 'unknown request_id' };
  // Chữ ký đúng nhưng của thẻ khác -> bỏ qua
  if (t.cardSerial !== serial || !t.cardCode || decrypt(t.cardCode) !== code) return { ok: false, reason: 'card mismatch' };
  const r = await settle(t.id, { status: Number(p.status), message: p.message, trans_id: p.trans_id, value: p.value, amount: p.amount }, 'callback');
  return { ok: true, ...r };
}

// Admin bấm "Kiểm tra lại" khi chưa nhận được callback
export async function checkCard(id: string) {
  const s = await getCardSettings();
  if (!s.apiUrl || !s.partnerKey) throw domainError(400, 'Chưa cấu hình đối tác đổi thẻ');
  const t = await prisma.transaction.findFirst({ where: { id, method: 'CARD' }, select: { id: true, status: true, cardTelco: true, cardSerial: true, cardCode: true, originalAmount: true } });
  if (!t || !t.cardCode || !t.cardSerial) throw domainError(404, 'Không tìm thấy giao dịch thẻ');
  if (t.status !== 'PENDING') return { status: t.status };
  const code = decrypt(t.cardCode);
  const r = await callProvider(s, {
    telco: t.cardTelco ?? '',
    code,
    serial: t.cardSerial,
    amount: String(Number(t.originalAmount ?? 0)),
    request_id: t.id,
    sign: sign(s.partnerKey, code, t.cardSerial),
    command: 'check',
  });
  return settle(t.id, r, 'check');
}
