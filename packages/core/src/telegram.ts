// Thông báo Telegram cho chủ shop (Admin > Thông báo Telegram). Dùng chung cho web và worker.
// Không bao giờ ném lỗi ra ngoài: gửi Telegram lỗi không được làm hỏng đơn hàng / nạp tiền.
import { prisma } from '@accszone/database';
import { getConfig, type ConfigValue } from './config';

export type TelegramSettings = ConfigValue<'telegram'>;
export type TelegramEvent = keyof TelegramSettings['events'];

export const TELEGRAM_VARIABLES: Record<TelegramEvent, [string, string][]> = {
  order: [['site', 'Tên website'], ['username', 'Khách mua'], ['product', 'Sản phẩm'], ['amount', 'Số lượng'], ['pay', 'Thành tiền (USD)'], ['code', 'Mã đơn'], ['source', 'Kho riêng / tên nguồn API'], ['ip', 'IP khách'], ['time', 'Thời gian']],
  deposit: [['site', 'Tên website'], ['username', 'Khách nạp'], ['method', 'Phương thức'], ['amount', 'Số tiền (USD)'], ['bonus', 'Tiền khuyến mãi (USD)'], ['balance', 'Số dư sau nạp'], ['time', 'Thời gian']],
  refund: [['site', 'Tên website'], ['username', 'Khách'], ['code', 'Mã đơn'], ['amount', 'Số tiền hoàn (USD)'], ['reason', 'Lý do'], ['time', 'Thời gian']],
  lowBalance: [['site', 'Tên website'], ['supplier', 'Tên nguồn API'], ['balance', 'Số dư còn lại (USD)'], ['threshold', 'Ngưỡng cảnh báo (USD)'], ['time', 'Thời gian']],
};

export const TELEGRAM_DEFAULTS: TelegramSettings = {
  enabled: false,
  botToken: '',
  chatId: '',
  events: { order: true, deposit: true, refund: true, lowBalance: true },
  lowBalanceUsd: 5,
  templates: {
    order: '🛒 <b>{username}</b> vừa mua <b>{amount}</b> × {product}\n💵 {pay} · Mã đơn <code>{code}</code>\n📦 {source}\n🕒 {time}',
    deposit: '💰 <b>{username}</b> vừa nạp <b>{amount}</b> qua {method}\n🎁 Khuyến mãi: {bonus} · Số dư: {balance}\n🕒 {time}',
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

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const usd = (v: { toString(): string } | number | null | undefined) => (v == null ? '$0' : `$${Number(v.toString()).toLocaleString('en-US', { maximumFractionDigits: 4 })}`);

// Mẫu tin là HTML admin tự viết; giá trị biến luôn được escape (tên sản phẩm, username do khách nhập)
export function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? escapeHtml(vars[k]!) : m));
}

async function siteName() {
  try {
    return (await getConfig('site.general')).name;
  } catch {
    return 'Shop';
  }
}

export async function sendTelegram(botToken: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(8_000),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!data?.ok) throw new Error(data?.description ?? `Telegram HTTP ${res.status}`);
}

async function notify(event: TelegramEvent, vars: Record<string, string>) {
  try {
    const s = await getTelegramSettings();
    if (!s.enabled || !s.botToken || !s.chatId || !s.events[event] || !s.templates[event].trim()) return;
    const text = renderTemplate(s.templates[event], { site: await siteName(), time: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }), ...vars });
    await sendTelegram(s.botToken, s.chatId, text);
  } catch (err) {
    console.warn(`[telegram] ${event} failed: ${err instanceof Error ? err.message : err}`);
  }
}

const who = (u: { username: string | null; email: string }) => u.username ?? u.email;

// ref: id hoặc mã đơn (route mua hàng chỉ có mã đơn)
export async function notifyOrder(ref: { id: string } | { code: string }, ip?: string) {
  const o = await prisma.order
    .findUnique({
      where: ref,
      select: { code: true, quantity: true, totalAmount: true, user: { select: { username: true, email: true } }, product: { select: { name: true } }, supplier: { select: { name: true } } },
    })
    .catch(() => null);
  if (!o) return;
  const name = o.product.name as Record<string, string> | null;
  await notify('order', {
    username: who(o.user),
    product: name?.vi ?? name?.en ?? Object.values(name ?? {})[0] ?? '',
    amount: String(o.quantity),
    pay: usd(o.totalAmount),
    code: o.code,
    source: o.supplier ? `Nguồn API: ${o.supplier.name}` : 'Kho riêng',
    ip: ip ?? '',
  });
}

const METHOD_LABEL: Record<string, string> = { USDT_TRC20: 'USDT TRC20', USDT_BEP20: 'USDT BEP20', BANK_TRANSFER: 'Ngân hàng', MANUAL: 'Admin cộng tay', MOMO: 'MoMo', CUSTOM: 'Nạp thủ công', CARD: 'Thẻ cào' };

export async function notifyDeposit(transactionId: string) {
  const t = await prisma.transaction
    .findUnique({ where: { id: transactionId }, select: { amount: true, method: true, balanceAfter: true, userId: true, createdAt: true, user: { select: { username: true, email: true } } } })
    .catch(() => null);
  if (!t) return;
  const bonus = await prisma.transaction
    .findFirst({ where: { userId: t.userId, type: 'BONUS', note: { contains: transactionId } }, select: { amount: true, balanceAfter: true } })
    .catch(() => null);
  await notify('deposit', {
    username: who(t.user),
    method: METHOD_LABEL[t.method] ?? t.method,
    amount: usd(t.amount),
    bonus: usd(bonus?.amount),
    balance: usd(bonus?.balanceAfter ?? t.balanceAfter),
  });
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
