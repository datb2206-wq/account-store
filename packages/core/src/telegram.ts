// Thông báo Telegram cho chủ shop (Admin > Thông báo Telegram). Dùng chung cho web và worker.
// Không bao giờ ném lỗi ra ngoài: gửi Telegram lỗi không được làm hỏng đơn hàng / nạp tiền.
import { prisma } from '@accszone/database';
import { getConfig, type ConfigValue } from './config';

export type TelegramSettings = ConfigValue<'telegram'>;
export type TelegramEvent = keyof TelegramSettings['events'];

export const TELEGRAM_VARIABLES: Record<TelegramEvent, [string, string][]> = {
  order: [['site', 'Tên website'], ['username', 'Khách mua'], ['product', 'Sản phẩm'], ['amount', 'Số lượng'], ['pay', 'Thành tiền (USD)'], ['code', 'Mã đơn'], ['source', 'Kho riêng / nguồn API + mã đơn bên nguồn'], ['apiCode', 'Mã đơn bên nguồn API'], ['supplier', 'Tên miền nguồn API (VD buyaccfb.com)'], ['ip', 'IP khách'], ['time', 'Thời gian']],
  deposit: [['site', 'Tên website'], ['username', 'Khách nạp'], ['method', 'Phương thức'], ['amount', 'Số tiền (USD)'], ['received', 'Số tiền thực nhận (VD 500,000 VND / 25 USDT)'], ['bonus', 'Tiền khuyến mãi (USD)'], ['balance', 'Số dư sau nạp'], ['time', 'Thời gian']],
  refund: [['site', 'Tên website'], ['username', 'Khách'], ['code', 'Mã đơn'], ['amount', 'Số tiền hoàn (USD)'], ['reason', 'Lý do'], ['time', 'Thời gian']],
  lowBalance: [['site', 'Tên website'], ['supplier', 'Tên nguồn API'], ['balance', 'Số dư còn lại (USD)'], ['threshold', 'Ngưỡng cảnh báo (USD)'], ['time', 'Thời gian']],
};

export const TELEGRAM_DEFAULTS: TelegramSettings = {
  enabled: false,
  botToken: '',
  chatId: '',
  events: { order: true, deposit: true, refund: true, lowBalance: true },
  lowBalanceUsd: 5,
  adminCommands: false,
  alerts: { adminAction: true, supplierNoFunds: true, newUser: true, systemError: true, supplierIssue: true, adminLogin: true, lowStock: true, bankUnmatched: true, duplicateCredit: true, dailyReport: true },
  lowStockQty: 5,
  templates: {
    order: '🛒 <b>{username}</b> vừa mua <b>{amount}</b> × {product}\n💵 {pay} · Mã đơn <code>{code}</code>\n📦 {source}\n🕒 {time}',
    deposit: '💰 <b>{username}</b> vừa nạp <b>{amount}</b> qua {method}\n💵 Thực nhận: {received}\n🎁 Khuyến mãi: {bonus} · Số dư: {balance}\n🕒 {time}',
    refund: '↩️ Hoàn <b>{amount}</b> cho <b>{username}</b> (đơn <code>{code}</code>)\nLý do: {reason}\n🕒 {time}',
    lowBalance: '⚠️ <b>Nguồn API sắp hết tiền</b>\n{supplier}: còn <b>{balance}</b> (ngưỡng {threshold})\nNạp thêm để đơn của khách không bị hoàn tiền.\n🕒 {time}',
  },
};

const TTL_MS = 60_000;
let cached: { value: TelegramSettings; at: number } | null = null;

export function clearTelegramCache() {
  cached = null;
}

export async function getTelegramSettings(): Promise<TelegramSettings> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  let value = TELEGRAM_DEFAULTS;
  try {
    value = await getConfig('telegram');
  } catch {}
  cached = { value, at: Date.now() };
  return value;
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const usd = (v: { toString(): string } | number | null | undefined) => (v == null ? '$0' : `$${Number(v.toString()).toLocaleString('en-US', { maximumFractionDigits: 4 })}`);

// Mẫu tin là HTML admin tự viết; giá trị biến luôn được escape (tên sản phẩm, username do khách nhập)
export function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? escapeHtml(vars[k]!) : m));
}

export async function siteName() {
  try {
    return (await getConfig('site.general')).name;
  } catch {
    return 'Shop';
  }
}

export type InlineKeyboard = ({ text: string; callback_data: string } | { text: string; url: string })[][];

export async function sendTelegram(botToken: string, chatId: string, text: string, keyboard?: InlineKeyboard) {
  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true, ...(keyboard?.length && { reply_markup: { inline_keyboard: keyboard } }) }),
    signal: AbortSignal.timeout(8_000),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!data?.ok) throw new Error(data?.description ?? `Telegram HTTP ${res.status}`);
}

// keyboard: nút bấm dưới tin (chỉ gắn khi bật "Nhận lệnh admin", vì bot admin mới xử lý được nút)
async function notify(event: TelegramEvent, vars: Record<string, string>, keyboard?: InlineKeyboard) {
  try {
    const s = await getTelegramSettings();
    if (!s.enabled || !s.botToken || !s.chatId || !s.events[event] || !s.templates[event].trim()) return;
    const text = renderTemplate(s.templates[event], { site: await siteName(), time: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }), ...vars });
    await sendTelegram(s.botToken, s.chatId, text, s.adminCommands ? keyboard : undefined);
  } catch (err) {
    console.warn(`[telegram] ${event} failed: ${err instanceof Error ? err.message : err}`);
  }
}

const who = (u: { username: string | null; email: string }) => u.username ?? u.email;

// ref: id hoặc mã đơn (route mua hàng chỉ có mã đơn)
const ORDER_SELECT = {
  id: true,
  code: true,
  quantity: true,
  totalAmount: true,
  status: true,
  externalOrderId: true,
  user: { select: { username: true, email: true, telegramName: true } },
  product: { select: { name: true } },
  supplier: { select: { name: true, baseUrl: true } },
} as const;

// Tên miền nguồn API (VD https://buyaccfb.com/api -> buyaccfb.com); không đọc được URL thì dùng tên nguồn
export function supplierDomain(s: { name: string; baseUrl: string }) {
  try {
    return new URL(s.baseUrl).hostname.replace(/^(www|api)\./, '');
  } catch {
    return s.name;
  }
}

export async function notifyOrder(ref: { id: string } | { code: string }, ip?: string) {
  const load = () => prisma.order.findUnique({ where: ref, select: ORDER_SELECT }).catch(() => null);
  let o = await load();
  if (!o) return;
  // Đơn nguồn API: chờ web nguồn trả mã đơn (tối đa ~60 giây) để tin báo có luôn mã đơn bên nguồn
  for (let i = 0; i < 20 && o?.supplier && o.status === 'PENDING' && !o.externalOrderId; i++) {
    await new Promise((r) => setTimeout(r, 3_000));
    o = (await load()) ?? o;
  }
  if (!o) return;
  const domain = o.supplier ? supplierDomain(o.supplier) : '';
  const apiCode = o.externalOrderId ?? '';
  const statusNote = o.status === 'REFUNDED' || o.status === 'FAILED' ? ' · ❌ Đơn nguồn lỗi, đã hoàn tiền' : o.status === 'PENDING' ? ' · ⏳ Nguồn đang xử lý' : '';
  const name = o.product.name as Record<string, string> | null;
  // Kênh mua: ghi ngay cạnh tên khách (mẫu tin mặc định không có {ip}) -> nhìn là biết đơn từ bot / API
  const via = ip === 'Bot Telegram' ? ` · 🤖 Bot Telegram${o.user.telegramName ? ` ${o.user.telegramName}` : ''}` : ip === 'API' ? ' · 🔑 API' : '';
  await notify('order', {
    username: `${who(o.user)}${via}`,
    // Báo cho admin: ưu tiên tên gốc của web nguồn (thường là tiếng Việt), không phải bản đã dịch
    product: name?.vi ?? name?.src ?? name?.en ?? Object.values(name ?? {})[0] ?? '',
    amount: String(o.quantity),
    pay: usd(o.totalAmount),
    code: o.code,
    source: o.supplier ? `Nguồn: ${domain}${apiCode ? ` · Mã đơn API: #${apiCode}` : ''}${statusNote}` : 'Kho riêng',
    apiCode: apiCode ? `#${apiCode}` : '—',
    supplier: domain || 'Kho riêng',
    ip: ip ?? '',
  }, [[{ text: '🧾 Chi tiết đơn', callback_data: `ov:${o.id}` }, { text: '💸 Hoàn tiền', callback_data: `rfn:${o.id}` }]]);
}

const METHOD_LABEL: Record<string, string> = { USDT_TRC20: 'USDT TRC20', USDT_BEP20: 'USDT BEP20', BANK_TRANSFER: 'Ngân hàng', MANUAL: 'Admin cộng tay', MOMO: 'MoMo', CUSTOM: 'Nạp thủ công', CARD: 'Thẻ cào', PIX: 'PIX' };

export async function notifyDeposit(transactionId: string) {
  const t = await prisma.transaction
    .findUnique({ where: { id: transactionId }, select: { amount: true, originalAmount: true, originalCurrency: true, method: true, balanceAfter: true, userId: true, createdAt: true, user: { select: { username: true, email: true } } } })
    .catch(() => null);
  if (!t) return;
  const bonus = await prisma.transaction
    .findFirst({ where: { userId: t.userId, type: 'BONUS', note: { contains: transactionId } }, select: { amount: true, balanceAfter: true } })
    .catch(() => null);
  // Shop bán cho Brazil: kèm số tiền quy ra R$ theo tỷ giá Admin > Tiền tệ (PIX thì lấy đúng số R$ khách trả)
  const rate = await getConfig('currency.rates').then((r) => r.BRL).catch(() => undefined);
  const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const withBrl = (v: { toString(): string } | null | undefined, exactBrl?: number) => {
    if (exactBrl != null) return `${usd(v)} (${brl(exactBrl)})`;
    return rate ? `${usd(v)} (≈ ${brl(Number(v?.toString() ?? 0) * rate)})` : usd(v);
  };
  const paidBrl = t.originalCurrency === 'BRL' && t.originalAmount ? Number(t.originalAmount.toString()) : undefined;
  await notifyCustomerDeposit(t.userId, t.amount, bonus?.amount ?? null, bonus?.balanceAfter ?? t.balanceAfter, t.originalCurrency && t.originalAmount ? { currency: t.originalCurrency, amount: Number(t.originalAmount.toString()) } : null);
  await notify('deposit', {
    username: who(t.user),
    method: METHOD_LABEL[t.method] ?? t.method,
    amount: withBrl(t.amount, paidBrl),
    received: t.originalAmount && t.originalCurrency ? `${Number(t.originalAmount.toString()).toLocaleString('en-US', { maximumFractionDigits: 6 })} ${t.originalCurrency}` : usd(t.amount),
    bonus: withBrl(bonus?.amount),
    balance: withBrl(bonus?.balanceAfter ?? t.balanceAfter),
  });
}

// Báo cho KHÁCH qua bot bán hàng (nếu khách đã có Telegram gắn với tài khoản): tiền vào là nhắn ngay.
// Số tiền hiện theo tiền mặc định của web (Admin > Tiền tệ), PIX thì hiện đúng số R$ khách trả.
const CUSTOMER_DEPOSIT_TEXT: Record<string, { title: string; balance: string; bonus: string }> = {
  pt: { title: '✅ <b>Recarga confirmada!</b>', balance: '💰 Novo saldo', bonus: '🎁 Bônus' },
  en: { title: '✅ <b>Top up confirmed!</b>', balance: '💰 New balance', bonus: '🎁 Bonus' },
};
const HTML_LANG: Record<string, string> = { pt: 'pt-BR', en: 'en-US', id: 'id-ID', ru: 'ru-RU', zh: 'zh-CN' };

async function displayCurrency(): Promise<{ code: string; rate: number; decimals: number }> {
  try {
    const [rates, display] = await Promise.all([getConfig('currency.rates'), getConfig('currency.display').catch(() => null)]);
    const code = display?.defaultCurrency && display.defaultCurrency !== 'AUTO' ? display.defaultCurrency : 'USD';
    if (code === 'USD') return { code, rate: 1, decimals: 2 };
    const meta = display?.currencies.find((c) => c.code === code);
    // Giống trang web: tiền tính theo VND (vndPer) thì tỷ giá = VND / vndPer
    const rate = meta?.vndPer && rates.VND ? rates.VND / meta.vndPer : rates[code];
    return rate ? { code, rate, decimals: meta?.decimals ?? 2 } : { code: 'USD', rate: 1, decimals: 2 };
  } catch {
    return { code: 'USD', rate: 1, decimals: 2 };
  }
}

async function notifyCustomerDeposit(
  userId: string,
  amountUsd: { toString(): string },
  bonusUsd: { toString(): string } | null,
  balanceUsd: { toString(): string } | null,
  paid: { currency: string; amount: number } | null,
) {
  try {
    const [shop, user] = await Promise.all([getConfig('telegram.shop'), prisma.user.findUnique({ where: { id: userId }, select: { telegramId: true, locale: true } })]);
    if (!shop.enabled || !shop.botToken || !user?.telegramId) return;
    const cur = await displayCurrency();
    const lang = HTML_LANG[user.locale] ?? 'en-US';
    const fmt = (usdValue: { toString(): string }) =>
      new Intl.NumberFormat(lang, { style: 'currency', currency: cur.code, minimumFractionDigits: cur.decimals, maximumFractionDigits: cur.decimals }).format(Number(usdValue.toString()) * cur.rate);
    const t = CUSTOMER_DEPOSIT_TEXT[user.locale] ?? CUSTOMER_DEPOSIT_TEXT.en!;
    const amount = paid && paid.currency === cur.code ? new Intl.NumberFormat(lang, { style: 'currency', currency: cur.code }).format(paid.amount) : fmt(amountUsd);
    const lines = [t.title, '', `➕ <b>${amount}</b>`];
    if (bonusUsd && Number(bonusUsd.toString()) > 0) lines.push(`${t.bonus}: +${fmt(bonusUsd)}`);
    if (balanceUsd) lines.push(`${t.balance}: <b>${fmt(balanceUsd)}</b>`);
    await sendTelegram(shop.botToken, user.telegramId, lines.join('\n'));
  } catch (err) {
    console.warn(`[telegram] customer deposit notify failed: ${err instanceof Error ? err.message : err}`);
  }
}

// Gửi thông báo hàng loạt từ bot bán hàng tới mọi khách đã bấm Start (tài khoản có Telegram, không bị khóa).
// Telegram cho tối đa ~30 tin/giây -> gửi ~20 tin/giây; bị giới hạn (429) thì chờ đúng số giây Telegram yêu cầu.
export interface BroadcastProgress {
  total: number;
  sent: number;
  failed: number;
  done: boolean;
}

export async function sendShopBroadcast(text: string, onProgress: (p: BroadcastProgress) => Promise<void> | void) {
  const shop = await getConfig('telegram.shop');
  if (!shop.enabled || !shop.botToken) throw new Error('Bot bán hàng chưa bật');
  const users = await prisma.user.findMany({ where: { telegramId: { not: null }, status: { not: 'BANNED' } }, select: { telegramId: true } });
  const p: BroadcastProgress = { total: users.length, sent: 0, failed: 0, done: false };
  await onProgress(p);
  for (const [i, u] of users.entries()) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(shop.botToken)}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: u.telegramId, text: text.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as { ok?: boolean; parameters?: { retry_after?: number } } | null;
      if (data?.ok) {
        p.sent++;
        break;
      }
      const wait = data?.parameters?.retry_after;
      if (wait && attempt < 2) {
        await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
        continue;
      }
      p.failed++; // khách đã chặn bot / xóa tài khoản Telegram
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
    if (i % 25 === 24) await onProgress(p);
  }
  p.done = true;
  await onProgress(p);
  return p;
}

export async function notifyRefund(orderId: string, amount: { toString(): string }, reason: string) {
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { code: true, user: { select: { username: true, email: true } } } }).catch(() => null);
  if (!o) return;
  await notify('refund', { username: who(o.user), code: o.code, amount: usd(amount), reason });
}

// Worker gọi sau mỗi lần đồng bộ. Báo tối đa 1 lần / 6 giờ cho mỗi nguồn (nhớ trong RAM của worker).
const lastLowAlert = new Map<string, number>();
export async function notifyLowBalance(supplierId: string, supplierName: string, balanceUsd: number) {
  const s = await getTelegramSettings();
  if (balanceUsd >= s.lowBalanceUsd) {
    lastLowAlert.delete(supplierId);
    return;
  }
  const last = lastLowAlert.get(supplierId) ?? 0;
  if (Date.now() - last < 6 * 3600_000) return;
  lastLowAlert.set(supplierId, Date.now());
  await notify('lowBalance', { supplier: supplierName, balance: usd(balanceUsd), threshold: usd(s.lowBalanceUsd) });
}
