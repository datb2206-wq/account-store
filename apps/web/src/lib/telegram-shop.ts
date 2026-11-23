// Bot Telegram cho khách: xem chuyên mục / sản phẩm, mua bằng số dư (dùng chung luồng purchase() của web), xem đơn, đổi ngôn ngữ.
// Khách phải liên kết tài khoản web (Dashboard > Kết nối Telegram) mới mua / xem số dư được.
import { randomBytes } from 'node:crypto';
import { getConfig } from '@accszone/core';
import { prisma, type Prisma } from '@accszone/database';
import { LOCALE_META, type Locale } from '@/i18n/config';
import { getLanguages } from './languages';
import { formatUsd, localized } from './format';
import { getOrderForUser, purchase, PurchaseError } from './purchase';
import { rateLimit } from './rate-limit';
import { getSiteExtras } from './site-extras';
import { getRedis } from './redis';
import {
  answerCallback,
  consumeLinkCode,
  displayName,
  editOrSend,
  escapeHtml,
  getChatState,
  sendDocument,
  sendText,
  setChatState,
  type Keyboard,
  type ShopBotSettings,
  type TgUpdate,
  type TgUser,
} from './telegram-bot';
import { localeFromTelegram, SHOP_TEXT, tr, type ShopText } from './telegram-shop-i18n';

const BOT = 'shop';
const CAT_PAGE = 10;
const PRODUCT_PAGE = 8;

interface Ctx {
  token: string;
  settings: ShopBotSettings;
  siteUrl: string;
  site: string;
  chatId: number;
  from: TgUser;
  messageId?: number; // tin của bot vừa bấm nút -> sửa tại chỗ
  locale: Locale;
  t: ShopText;
  user: { id: string; email: string; username: string | null; balance: Prisma.Decimal; status: string } | null;
}

// Sản phẩm khách được thấy: giống điều kiện mua trong purchase()
const VISIBLE: Prisma.ProductWhereInput = {
  isActive: true,
  approval: 'APPROVED',
  category: { isActive: true },
  AND: [{ OR: [{ sellerId: null }, { seller: { status: 'ACTIVE' } }] }, { OR: [{ source: 'LOCAL' }, { supplier: { isActive: true } }] }],
};

// Còn hàng: kho riêng có tài khoản AVAILABLE / nguồn API báo tồn > 0
const IN_STOCK: Prisma.ProductWhereInput = { OR: [{ source: 'LOCAL', stockItems: { some: { status: 'AVAILABLE' } } }, { source: 'RESELLER', externalStock: { gt: 0 } }] };
// Danh sách trong bot ẩn hàng hết giống trang web (Admin > Cài đặt website > Tự ẩn sản phẩm hết hàng)
async function listWhere(extra: Prisma.ProductWhereInput = {}): Promise<Prisma.ProductWhereInput> {
  const { catalog } = await getSiteExtras();
  return { ...VISIBLE, ...extra, ...(catalog.hideSoldOut && { AND: [...(VISIBLE.AND as Prisma.ProductWhereInput[]), IN_STOCK] }) };
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function handleShopUpdate(update: TgUpdate, settings: ShopBotSettings, siteUrl: string) {
  const msg = update.message;
  const cb = update.callback_query;
  const from = msg?.from ?? cb?.from;
  const chat = msg?.chat ?? cb?.message?.chat;
  if (!from || !chat || chat.type !== 'private') return; // chỉ chat riêng với bot

  const ctx = await buildCtx(settings, siteUrl, chat.id, from, cb?.message?.message_id);
  const limit = await rateLimit(`tg:shop:${from.id}`, 40, 60).catch(() => ({ ok: true as const }));
  if (!limit.ok) {
    if (cb) await answerCallback(ctx.token, cb.id, ctx.t.tooFast);
    return;
  }

  try {
    if (await maintenance()) {
      if (cb) await answerCallback(ctx.token, cb.id);
      await sendText(ctx.token, ctx.chatId, ctx.t.maintenance);
      return;
    }
    if (cb) {
      await answerCallback(ctx.token, cb.id);
      await onCallback(ctx, cb.data ?? '');
    } else if (msg?.text) {
      await onText(ctx, msg.text.trim());
    }
  } catch (err) {
    console.error('[telegram-shop]', err);
    await sendText(ctx.token, ctx.chatId, ctx.t.error).catch(() => {});
  }
}

async function maintenance() {
  try {
    return (await getConfig('site.general')).maintenance;
  } catch {
    return false;
  }
}

async function buildCtx(settings: ShopBotSettings, siteUrl: string, chatId: number, from: TgUser, messageId?: number): Promise<Ctx> {
  const user = await prisma.user.findUnique({
    where: { telegramId: String(from.id) },
    select: { id: true, email: true, username: true, balance: true, status: true, locale: true },
  });
  const saved = user ? null : await getRedis().get(`tg:lang:${from.id}`).catch(() => null);
  const { enabled, defaultLocale } = await getLanguages();
  const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (enabled as readonly string[]).includes(v);
  const wanted = user ? user.locale : isLocale(saved) ? saved : localeFromTelegram(from.language_code);
  const locale: Locale = isLocale(wanted) ? wanted : defaultLocale; // ngôn ngữ admin đã tắt -> ngôn ngữ mặc định
  let site = 'Shop';
  try {
    site = (await getConfig('site.general')).name;
  } catch {}
  return {
    token: settings.botToken,
    settings,
    siteUrl,
    site,
    chatId,
    from,
    messageId,
    locale,
    t: SHOP_TEXT[locale],
    user: user && user.status !== 'BANNED' ? user : null,
  };
}

// ---------------------------------------------------------------- Tin nhắn chữ
async function onText(ctx: Ctx, text: string) {
  const [cmd, arg] = text.split(/\s+/, 2);
  if (cmd === '/start') {
    if (arg) await linkAccount(ctx, arg);
    return showMenu(ctx, true);
  }
  if (cmd === '/menu') return showMenu(ctx, true);
  if (cmd === '/products') return showCategories(ctx, 0, true);
  if (cmd === '/balance') return showBalance(ctx, true);
  if (cmd === '/orders') return showOrders(ctx, true);
  if (cmd === '/language') return showLanguages(ctx, true);

  // Đang chờ nhập số lượng
  const state = await getChatState(BOT, ctx.chatId);
  if (state?.startsWith('qty:') && /^\d{1,6}$/.test(text)) {
    await setChatState(BOT, ctx.chatId, null);
    return showConfirm(ctx, state.slice(4), Number(text), true);
  }
  return showMenu(ctx, true);
}

async function linkAccount(ctx: Ctx, code: string) {
  const userId = await consumeLinkCode(code);
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, username: true, status: true, locale: true } }) : null;
  if (!user || user.status === 'BANNED') {
    await sendText(ctx.token, ctx.chatId, ctx.t.linkInvalid);
    return;
  }
  const telegramId = String(ctx.from.id);
  await prisma.$transaction([
    // 1 Telegram chỉ gắn 1 tài khoản: gỡ khỏi tài khoản cũ (nếu có)
    prisma.user.updateMany({ where: { telegramId, NOT: { id: user.id } }, data: { telegramId: null, telegramName: null } }),
    prisma.user.update({ where: { id: user.id }, data: { telegramId, telegramName: displayName(ctx.from) || null } }),
  ]);
  const fresh = await buildCtx(ctx.settings, ctx.siteUrl, ctx.chatId, ctx.from);
  Object.assign(ctx, fresh);
  await sendText(ctx.token, ctx.chatId, tr(ctx.t, 'linked', { account: escapeHtml(user.username ?? user.email) }));
}

// ---------------------------------------------------------------- Nút bấm
async function onCallback(ctx: Ctx, data: string) {
  const [kind, a = '', b = '', c = ''] = data.split(':');
  switch (kind) {
    case 'm':
      return showMenu(ctx);
    case 'cl':
      return showCategories(ctx, Number(a) || 0);
    case 'c':
      return showProducts(ctx, a, Number(b) || 0);
    case 'p':
      return showProduct(ctx, a);
    case 'qx':
      return askQuantity(ctx, a);
    case 'q':
      return showConfirm(ctx, a, Number(b));
    case 'y':
      return buy(ctx, a, Number(b), c);
    case 'b':
      return showBalance(ctx);
    case 'ul':
      return unlink(ctx);
    case 'o':
      return showOrders(ctx);
    case 'od':
      return sendOrder(ctx, a);
    case 'l':
      return showLanguages(ctx);
    case 'lg':
      return setLanguage(ctx, a);
    default:
      return showMenu(ctx);
  }
}

const show = (ctx: Ctx, fresh: boolean, text: string, kb: Keyboard) => (fresh ? sendText(ctx.token, ctx.chatId, text, kb) : editOrSend(ctx.token, ctx.chatId, ctx.messageId, text, kb));
const menuRow = (ctx: Ctx) => [{ text: ctx.t.btnMenu, callback_data: 'm' }];

function showMenu(ctx: Ctx, fresh = false) {
  const kb: Keyboard = [
    [{ text: ctx.t.btnProducts, callback_data: 'cl:0' }],
    [
      { text: ctx.t.btnBalance, callback_data: 'b' },
      { text: ctx.t.btnOrders, callback_data: 'o' },
    ],
    [
      { text: ctx.t.btnLanguage, callback_data: 'l' },
      ctx.settings.supportUrl ? { text: ctx.t.btnSupport, url: ctx.settings.supportUrl } : { text: ctx.t.btnWebsite, url: ctx.siteUrl },
    ],
  ];
  return show(ctx, fresh, tr(ctx.t, 'menu', { site: escapeHtml(ctx.site) }), kb);
}

function needLink(ctx: Ctx, fresh: boolean) {
  return show(ctx, fresh, tr(ctx.t, 'needLink', { site: escapeHtml(ctx.site) }), [[{ text: ctx.t.btnConnect, url: `${ctx.siteUrl}/dashboard#telegram` }], menuRow(ctx)]);
}

async function showCategories(ctx: Ctx, page: number, fresh = false) {
  const groups = await prisma.product.groupBy({ by: ['categoryId'], where: await listWhere(), _count: { _all: true } });
  const counts = new Map(groups.map((g) => [g.categoryId, g._count._all]));
  const cats = await prisma.category.findMany({ where: { id: { in: [...counts.keys()] } }, select: { id: true, name: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  if (!cats.length) return show(ctx, fresh, ctx.t.noProducts, [menuRow(ctx)]);

  const pages = Math.ceil(cats.length / CAT_PAGE);
  const p = Math.min(Math.max(page, 0), pages - 1);
  const kb: Keyboard = cats.slice(p * CAT_PAGE, (p + 1) * CAT_PAGE).map((c) => [{ text: short(`${localized(c.name, ctx.locale)} (${counts.get(c.id)})`, 60), callback_data: `c:${c.id}:0` }]);
  kb.push(pager(p, pages, (n) => `cl:${n}`));
  kb.push(menuRow(ctx));
  return show(ctx, fresh, ctx.t.categories, kb.filter((r) => r.length));
}

function pager(p: number, pages: number, data: (n: number) => string) {
  if (pages <= 1) return [];
  return [
    ...(p > 0 ? [{ text: '◀️', callback_data: data(p - 1) }] : []),
    { text: `${p + 1}/${pages}`, callback_data: data(p) },
    ...(p < pages - 1 ? [{ text: '▶️', callback_data: data(p + 1) }] : []),
  ];
}

async function stockOf(products: { id: string; source: string; externalStock: number | null }[]) {
  const local = products.filter((p) => p.source === 'LOCAL').map((p) => p.id);
  const rows = local.length ? await prisma.stockItem.groupBy({ by: ['productId'], where: { productId: { in: local }, status: 'AVAILABLE' }, _count: { _all: true } }) : [];
  const map = new Map(rows.map((r) => [r.productId, r._count._all]));
  return new Map(products.map((p) => [p.id, p.source === 'LOCAL' ? (map.get(p.id) ?? 0) : Math.max(p.externalStock ?? 0, 0)]));
}

async function showProducts(ctx: Ctx, categoryId: string, page: number) {
  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { name: true } });
  if (!category) return showCategories(ctx, 0);
  const where = await listWhere({ categoryId });
  const total = await prisma.product.count({ where });
  const pages = Math.max(Math.ceil(total / PRODUCT_PAGE), 1);
  const p = Math.min(Math.max(page, 0), pages - 1);
  const products = await prisma.product.findMany({
    where,
    orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    skip: p * PRODUCT_PAGE,
    take: PRODUCT_PAGE,
    select: { id: true, name: true, price: true, source: true, externalStock: true },
  });
  const stock = await stockOf(products);
  const kb: Keyboard = products.map((x) => {
    const s = stock.get(x.id) ?? 0;
    return [{ text: short(`${s > 0 ? '🟢' : '🔴'} ${localized(x.name, ctx.locale)} · ${formatUsd(x.price)}`, 64), callback_data: `p:${x.id}` }];
  });
  kb.push(pager(p, pages, (n) => `c:${categoryId}:${n}`));
  kb.push([{ text: ctx.t.btnBack, callback_data: 'cl:0' }, ...menuRow(ctx)]);
  return show(ctx, false, tr(ctx.t, 'products', { cat: escapeHtml(localized(category.name, ctx.locale)) }), kb.filter((r) => r.length));
}

async function loadProduct(productId: string) {
  return prisma.product.findFirst({
    where: { ...VISIBLE, id: productId },
    select: { id: true, name: true, description: true, price: true, minQty: true, maxQty: true, source: true, externalStock: true, categoryId: true },
  });
}

async function showProduct(ctx: Ctx, productId: string) {
  const product = await loadProduct(productId);
  if (!product) return show(ctx, false, ctx.t.unavailable, [menuRow(ctx)]);
  const stock = (await stockOf([product])).get(product.id) ?? 0;
  const desc = localized(product.description, ctx.locale).replace(/<[^>]+>/g, '').trim();
  const lines = [
    `<b>${escapeHtml(localized(product.name, ctx.locale))}</b>`,
    '',
    `💵 ${ctx.t.price}: <b>${formatUsd(product.price)}</b>`,
    `📦 ${stock > 0 ? `${ctx.t.stock}: <b>${stock}</b>` : ctx.t.outOfStock}`,
    ...(desc ? ['', escapeHtml(short(desc, 900))] : []),
  ];
  const max = Math.min(product.maxQty, stock);
  const kb: Keyboard = [];
  if (stock >= product.minQty) {
    const options = [...new Set([product.minQty, 1, 2, 5, 10, 20, 50])].filter((n) => n >= product.minQty && n <= max).slice(0, 5);
    kb.push(options.map((n) => ({ text: `🛒 ${n}`, callback_data: `q:${product.id}:${n}` })));
    kb.push([{ text: ctx.t.btnOtherQty, callback_data: `qx:${product.id}` }]);
    lines.push('', ctx.t.chooseQty);
  }
  kb.push([{ text: ctx.t.btnBack, callback_data: `c:${product.categoryId}:0` }, ...menuRow(ctx)]);
  return show(ctx, false, lines.join('\n'), kb);
}

async function askQuantity(ctx: Ctx, productId: string) {
  const product = await loadProduct(productId);
  if (!product) return show(ctx, false, ctx.t.unavailable, [menuRow(ctx)]);
  await setChatState(BOT, ctx.chatId, `qty:${product.id}`);
  return sendText(ctx.token, ctx.chatId, tr(ctx.t, 'askQty', { min: product.minQty, max: product.maxQty }));
}

async function showConfirm(ctx: Ctx, productId: string, qty: number, fresh = false) {
  if (!ctx.user) return needLink(ctx, fresh);
  const product = await loadProduct(productId);
  if (!product) return show(ctx, fresh, ctx.t.unavailable, [menuRow(ctx)]);
  if (!Number.isInteger(qty) || qty < product.minQty || qty > product.maxQty) {
    await setChatState(BOT, ctx.chatId, `qty:${product.id}`);
    return sendText(ctx.token, ctx.chatId, tr(ctx.t, 'badQty', { min: product.minQty, max: product.maxQty }));
  }
  const total = product.price.mul(qty);
  const text = tr(ctx.t, 'confirm', {
    name: escapeHtml(localized(product.name, ctx.locale)),
    qty,
    total: formatUsd(total),
    balance: formatUsd(ctx.user.balance),
  });
  // Mã ngẫu nhiên trong nút xác nhận = khóa chống mua trùng (bấm 2 lần chỉ ra 1 đơn)
  const nonce = randomBytes(6).toString('base64url');
  const kb: Keyboard = ctx.user.balance.lt(total)
    ? [[{ text: ctx.t.btnDeposit, url: `${ctx.siteUrl}/dashboard/deposit` }], [{ text: ctx.t.btnBack, callback_data: `p:${product.id}` }]]
    : [[{ text: ctx.t.btnConfirm, callback_data: `y:${product.id}:${qty}:${nonce}` }], [{ text: ctx.t.btnCancel, callback_data: `p:${product.id}` }]];
  return show(ctx, fresh, ctx.user.balance.lt(total) ? `${text}\n\n${ctx.t.noBalance}` : text, kb);
}

async function buy(ctx: Ctx, productId: string, qty: number, nonce: string) {
  if (!ctx.user) return needLink(ctx, false);
  if (!/^[A-Za-z0-9_-]{4,16}$/.test(nonce) || !Number.isInteger(qty) || qty < 1) return showMenu(ctx);
  await editOrSend(ctx.token, ctx.chatId, ctx.messageId, ctx.t.buying);
  let result: Awaited<ReturnType<typeof purchase>>;
  try {
    result = await purchase({ userId: ctx.user.id, productId, quantity: qty, idempotencyKey: `tg:${nonce}` });
  } catch (err) {
    if (err instanceof PurchaseError) {
      const text = err.status === 402 ? ctx.t.noBalance : err.status === 409 ? ctx.t.notEnoughStock : err.status === 404 ? ctx.t.unavailable : escapeHtml(err.message);
      const kb: Keyboard = err.status === 402 ? [[{ text: ctx.t.btnDeposit, url: `${ctx.siteUrl}/dashboard/deposit` }], menuRow(ctx)] : [menuRow(ctx)];
      return editOrSend(ctx.token, ctx.chatId, ctx.messageId, text, kb);
    }
    throw err;
  }
  await deliver(ctx, result.order.code);
  // Đơn nguồn API đang xử lý: chờ tối đa ~2 phút rồi gửi hàng; lâu hơn thì khách xem ở "Đơn hàng của tôi"
  if (result.order.status === 'PENDING') {
    const userId = ctx.user.id;
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5_000));
      const o = await prisma.order.findFirst({ where: { code: result.order.code, userId }, select: { status: true } });
      if (o && o.status !== 'PENDING') return deliver(ctx, result.order.code);
    }
  }
}

// Gửi trạng thái + file tài khoản của 1 đơn
async function deliver(ctx: Ctx, code: string) {
  if (!ctx.user) return;
  const order = await getOrderForUser(code, ctx.user.id, ctx.locale);
  if (!order) return;
  const o = order.order;
  const name = escapeHtml(o.productName);
  if (o.status === 'PENDING') return sendText(ctx.token, ctx.chatId, `${tr(ctx.t, 'pending', { code: o.code })}\n${name} × ${o.quantity}`, [[{ text: ctx.t.btnOrders, callback_data: 'o' }], menuRow(ctx)]);
  if (o.status === 'FAILED' || o.status === 'REFUNDED') {
    if (!order.items.length) return sendText(ctx.token, ctx.chatId, tr(ctx.t, 'failed', { code: o.code, reason: escapeHtml(o.failReason ?? ctx.t[`st_${o.status}`]) }), [menuRow(ctx)]);
  }
  if (!order.items.length) return sendText(ctx.token, ctx.chatId, tr(ctx.t, 'noItems', { code: o.code, status: ctx.t[`st_${o.status as 'COMPLETED'}`] }), [menuRow(ctx)]);
  const caption = `${tr(ctx.t, 'delivered', { code: o.code })}\n${name} × ${o.quantity} · ${formatUsd(o.totalAmount)}`;
  await sendDocument(ctx.token, ctx.chatId, `${o.code}.txt`, `${order.items.join('\n')}\n`, caption);
  return sendText(ctx.token, ctx.chatId, tr(ctx.t, 'menu', { site: escapeHtml(ctx.site) }), [[{ text: ctx.t.btnProducts, callback_data: 'cl:0' }, { text: ctx.t.btnOrders, callback_data: 'o' }]]);
}

async function showBalance(ctx: Ctx, fresh = false) {
  if (!ctx.user) return needLink(ctx, fresh);
  const text = tr(ctx.t, 'balance', { balance: `<b>${formatUsd(ctx.user.balance)}</b>`, account: escapeHtml(ctx.user.username ?? ctx.user.email) });
  return show(ctx, fresh, text, [
    [{ text: ctx.t.btnDeposit, url: `${ctx.siteUrl}/dashboard/deposit` }],
    [{ text: ctx.t.btnOrders, callback_data: 'o' }, { text: ctx.t.btnUnlink, callback_data: 'ul' }],
    menuRow(ctx),
  ]);
}

async function unlink(ctx: Ctx) {
  if (ctx.user) await prisma.user.update({ where: { id: ctx.user.id }, data: { telegramId: null, telegramName: null } });
  ctx.user = null;
  return show(ctx, false, ctx.t.unlinked, [menuRow(ctx)]);
}

async function showOrders(ctx: Ctx, fresh = false) {
  if (!ctx.user) return needLink(ctx, fresh);
  const orders = await prisma.order.findMany({
    where: { userId: ctx.user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { code: true, status: true, quantity: true, product: { select: { name: true } } },
  });
  if (!orders.length) return show(ctx, fresh, ctx.t.noOrders, [[{ text: ctx.t.btnProducts, callback_data: 'cl:0' }], menuRow(ctx)]);
  const icon: Record<string, string> = { COMPLETED: '✅', PENDING: '⏳', FAILED: '❌', REFUNDED: '↩️' };
  const kb: Keyboard = orders.map((o) => [{ text: short(`${icon[o.status] ?? ''} ${o.code} · ${localized(o.product.name, ctx.locale)} × ${o.quantity}`, 64), callback_data: `od:${o.code}` }]);
  kb.push(menuRow(ctx));
  return show(ctx, fresh, ctx.t.orders, kb);
}

async function sendOrder(ctx: Ctx, code: string) {
  if (!ctx.user) return needLink(ctx, false);
  if (!/^[A-Z0-9-]{4,40}$/i.test(code)) return showOrders(ctx);
  return deliver(ctx, code);
}

async function showLanguages(ctx: Ctx, fresh = false) {
  const { enabled } = await getLanguages();
  const kb: Keyboard = enabled.map((l) => [{ text: `${l === ctx.locale ? '✅ ' : ''}${LOCALE_META[l].name}`, callback_data: `lg:${l}` }]);
  kb.push(menuRow(ctx));
  return show(ctx, fresh, ctx.t.language, kb);
}

async function setLanguage(ctx: Ctx, raw: string) {
  const { enabled } = await getLanguages();
  if (!(enabled as readonly string[]).includes(raw)) return showLanguages(ctx);
  const value = raw as Locale;
  if (ctx.user) await prisma.user.update({ where: { id: ctx.user.id }, data: { locale: value } });
  else await getRedis().set(`tg:lang:${ctx.from.id}`, value, 'EX', 180 * 86400).catch(() => {});
  ctx.locale = value;
  ctx.t = SHOP_TEXT[value];
  await sendText(ctx.token, ctx.chatId, ctx.t.langSaved);
  return showMenu(ctx, true);
}
