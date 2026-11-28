// Bot Telegram bán hàng cho khách.
//  - Bấm Start là có tài khoản ngay (tg_<Telegram ID>), không cần đăng ký; tài khoản web đã có thì liên kết bằng link ở Dashboard.
//  - Xem chuyên mục cha -> con / tất cả sản phẩm / tìm kiếm, mua bằng số dư (dùng chung purchase() của web: kho riêng + nguồn API, tự hoàn tiền).
//  - Nạp tiền ngay trong bot (PIX, USDT), xem tài khoản, đơn hàng, lịch sử giao dịch, đổi ngôn ngữ / tiền tệ.
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { checkPixDeposit, createPixDeposit, createUsdtDeposit, creditCommission, creditSellerEarning, emailOrder, getConfig, getPixSettings, getTelegramSettings, notifyOrder, pixReady, supplierDomain, type UsdtNetwork } from '@accszone/core';
import { getSiteUrl } from './site';
import { prisma, type Prisma } from '@accszone/database';
import { formatFx, LOCALE_CURRENCY, LOCALE_META, type Fx, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { translateError } from '@/i18n/errors';
import { evaluateCoupon } from './coupons';
import { getCurrencySettings } from './fx';
import { getLanguages } from './languages';
import { formatUsd, localized } from './format';
import { getOrderForUser, purchase, PurchaseError } from './purchase';
import { rateLimit } from './rate-limit';
import { getSiteExtras } from './site-extras';
import { getRedis } from './redis';
import { createTelegramAccount, isTelegramPlaceholderEmail } from './telegram-account';
import { API_KEY_RE, getApiKey, regenerateApiKey, userByApiKey } from './api-keys';
import {
  answerCallback,
  consumeLinkCode,
  deleteMessage,
  displayName,
  editOrSend,
  escapeHtml,
  getChatState,
  sendDocument,
  sendPhoto,
  sendText,
  downloadFile,
  setChatState,
  tg,
  warrantyKey,
  writeBotLog,
  type Keyboard,
  type ShopBotSettings,
  type TgUpdate,
  type TgUser,
} from './telegram-bot';
import { SHOP_TEXT, tr, type ShopText } from './telegram-shop-i18n';

const BOT = 'shop';
const CAT_PAGE = 10;
const PRODUCT_PAGE = 8;
const ORDER_PAGE = 8;
const HISTORY_PAGE = 10;

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
  fx: Fx;
  user: { id: string; email: string; username: string | null; balance: Prisma.Decimal; status: string; createdAt: Date } | null;
  banned: boolean;
  isNew: boolean; // tài khoản vừa được tạo tự động ở lần nhắn này
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
  const and = [...(VISIBLE.AND as Prisma.ProductWhereInput[]), ...(catalog.hideSoldOut ? [IN_STOCK] : []), ...((extra.AND as Prisma.ProductWhereInput[] | undefined) ?? [])];
  return { ...VISIBLE, ...extra, AND: and };
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const SEP = '━━━━━━━━━━━━━━━━';

// Biểu tượng theo tên chuyên mục (cờ quốc gia trước, rồi nền tảng) -> danh sách trong bot dễ nhìn hơn
const ICONS: [RegExp, string][] = [
  [/\b(us|usa|eua|estados unidos|mỹ)\b/i, '🇺🇸'],
  [/vietn|việt/i, '🇻🇳'],
  [/fran[cç]a|france|pháp/i, '🇫🇷'],
  [/eslov|slovak/i, '🇸🇰'],
  [/pol[oô]nia|poland|ba lan/i, '🇵🇱'],
  [/[ií]ndia\b|ấn độ/i, '🇮🇳'],
  [/indon[eé]s/i, '🇮🇩'],
  [/bangladesh/i, '🇧🇩'],
  [/mianmar|myanmar/i, '🇲🇲'],
  [/tail[aâ]nd|thai|thái/i, '🇹🇭'],
  [/afeganist|afghan/i, '🇦🇫'],
  [/serra leoa|sierra leone/i, '🇸🇱'],
  [/europa|europe|châu âu/i, '🇪🇺'],
  [/instagram/i, '📸'],
  [/threads/i, '🧵'],
  [/facebook|\bfb\b|\bbm\b|\bcas?\b/i, '📘'],
  [/tiktok/i, '🎵'],
  [/gmail|google voice/i, '📧'],
  [/hotmail|outlook/i, '📨'],
  [/google ads/i, '📈'],
  [/youtube/i, '▶️'],
  [/whatsapp/i, '💬'],
  [/telegram/i, '✈️'],
  [/linkedin|indeed/i, '💼'],
  [/twitter|\/x\b/i, '🐦'],
  [/chatgpt|\bia\b|\bai\b|openai/i, '🤖'],
  [/prox/i, '🌐'],
  [/discord|twitch/i, '🎮'],
  [/reddit/i, '👽'],
  [/bluesky/i, '🦋'],
  [/quora/i, '❓'],
  [/ok.ru|odnoklassniki/i, '🟠'],
  [/etsy|trustpilot|yelp/i, '⭐'],
  [/perfis|profile/i, '👤'],
];
type IconNode = { name: unknown; parentId: string | null };
// Chuyên mục không khớp từ khóa nào -> dùng biểu tượng của chuyên mục cha (VD "Perfis Gringos" nằm trong "Contas Facebook")
function catIcon(node: IconNode, nodes: Map<string, IconNode>, locale: Locale, depth = 0): string {
  const own = ICONS.find(([re]) => re.test(localized(node.name, locale)))?.[1];
  if (own && own !== '👤') return own;
  const parent = node.parentId ? nodes.get(node.parentId) : undefined;
  if (parent && depth < 5) {
    const up = catIcon(parent, nodes, locale, depth + 1);
    if (up !== '📂') return up;
  }
  return own ?? '📂';
}
// Mô tả sản phẩm dạng HTML -> chữ thường, giữ xuống dòng / gạch đầu dòng
function descText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
const money = (ctx: Ctx, usd: { toString(): string } | number) => formatFx(usd.toString(), ctx.fx, ctx.locale, false) ?? formatUsd(usd.toString());
const fmtDate = (ctx: Ctx, d: Date) =>
  d.toLocaleString(LOCALE_META[ctx.locale].htmlLang, { dateStyle: 'short', timeStyle: 'short', timeZone: ctx.locale === 'pt' ? 'America/Sao_Paulo' : 'UTC' });
const accountName = (ctx: Ctx) => ctx.user?.username ?? ctx.user?.email ?? '';
const errText = (ctx: Ctx, err: unknown) => escapeHtml(translateError(err instanceof Error ? err.message : String(err), getDictionary(ctx.locale)));

export async function handleShopUpdate(update: TgUpdate, settings: ShopBotSettings, siteUrl: string) {
  const msg = update.message;
  const cb = update.callback_query;
  const from = msg?.from ?? cb?.from;
  const chat = msg?.chat ?? cb?.message?.chat;
  if (!from || !chat || chat.type !== 'private') return; // chỉ chat riêng với bot
  const started = Date.now();
  const text = msg?.text?.trim() ?? '';
  // Đặt mật khẩu: không ghi nội dung tin nhắn vào nhật ký
  const logData = cb ? (cb.data ?? '') : text.startsWith('/') ? text.slice(0, 60) : msg?.photo || msg?.document ? `(ảnh, chú thích ${msg.caption?.length ?? 0} ký tự)` : `(${text.length} ký tự)`;
  let error: string | undefined;

  const limit = await rateLimit(`tg:shop:${from.id}`, 40, 60).catch(() => ({ ok: true as const }));
  if (!limit.ok) {
    if (cb) await answerCallback(settings.botToken, cb.id, SHOP_TEXT.en.tooFast);
    return;
  }

  let ctx: Ctx | null = null;
  try {
    const [cmd, arg] = text.split(/\s+/, 2);
    const linking = cmd === '/start' && !!arg;
    ctx = await buildCtx(settings, siteUrl, chat.id, from, cb?.message?.message_id, !linking);
    if (cb) await answerCallback(ctx.token, cb.id);
    if (await maintenance()) {
      await sendText(ctx.token, ctx.chatId, ctx.t.maintenance);
    } else if (linking) {
      await linkAccount(ctx, arg!);
      Object.assign(ctx, await buildCtx(settings, siteUrl, chat.id, from, undefined, true));
      if (!ctx.banned) await showHome(ctx, true);
      else await sendText(ctx.token, ctx.chatId, ctx.t.banned);
    } else if (ctx.banned) {
      await sendText(ctx.token, ctx.chatId, ctx.t.banned);
    } else if (cb) {
      await onCallback(ctx, cb.data ?? '');
    } else if (msg?.text) {
      await onText(ctx, text, msg.message_id);
    } else if (msg?.photo?.length || msg?.document?.mime_type?.startsWith('image/')) {
      // Ảnh chụp lỗi trong lúc gửi bảo hành
      const fileId = msg.photo?.length ? msg.photo[msg.photo.length - 1]!.file_id : msg.document!.file_id;
      await onWarrantyPhoto(ctx, fileId, msg.caption?.trim() ?? '');
    }
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 300) : String(err);
    console.error('[telegram-shop]', err);
    await sendText(settings.botToken, chat.id, (ctx?.t ?? SHOP_TEXT.en).error).catch(() => {});
  } finally {
    await writeBotLog(BOT, { at: new Date().toISOString(), from: `${from.id}${from.username ? ` @${from.username}` : ''}`, kind: cb ? 'btn' : 'msg', data: logData, ms: Date.now() - started, ...(error && { error }) });
  }
}

async function maintenance() {
  try {
    return (await getConfig('site.general')).maintenance;
  } catch {
    return false;
  }
}

const userSelect = { id: true, email: true, username: true, balance: true, status: true, locale: true, createdAt: true } as const;

async function buildCtx(settings: ShopBotSettings, siteUrl: string, chatId: number, from: TgUser, messageId: number | undefined, autoCreate: boolean): Promise<Ctx> {
  const { enabled, defaultLocale } = await getLanguages();
  const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (enabled as readonly string[]).includes(v);
  let user = await prisma.user.findUnique({ where: { telegramId: String(from.id) }, select: userSelect });
  let isNew = false;
  if (!user && autoCreate) {
    const created = await createTelegramAccount(from.id, displayName(from) || null, defaultLocale);
    user = created ? await prisma.user.findUnique({ where: { id: created.id }, select: userSelect }) : null;
    isNew = !!user;
  }
  const saved = user ? null : await getRedis().get(`tg:lang:${from.id}`).catch(() => null);
  // Ngôn ngữ: theo tài khoản (khách đổi trong bot / web) -> ngôn ngữ mặc định của web (không theo ngôn ngữ app Telegram)
  const wanted = user ? user.locale : isLocale(saved) ? saved : defaultLocale;
  const locale: Locale = isLocale(wanted) ? wanted : defaultLocale;
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
    fx: await botFx(from.id, locale),
    user: user && user.status !== 'BANNED' ? user : null,
    banned: user?.status === 'BANNED',
    isNew,
  };
}

// Tiền hiển thị: khách chọn trong bot -> tiền mặc định admin đặt -> theo ngôn ngữ. Số dư & thanh toán vẫn tính bằng USD.
async function botFx(telegramId: number, locale: Locale): Promise<Fx> {
  const settings = await getCurrencySettings();
  const usable = (code: string | null | undefined) => settings.currencies.find((c) => c.code === code && c.enabled);
  const chosen = await getRedis().get(`tg:cur:${telegramId}`).catch(() => null);
  const pick = usable(chosen) ?? (settings.defaultCurrency !== 'AUTO' ? usable(settings.defaultCurrency) : undefined) ?? usable(LOCALE_CURRENCY[locale]);
  if (!pick || pick.code === 'USD') return null;
  return { currency: pick.code, rate: pick.rate, decimals: pick.decimals };
}

// ---------------------------------------------------------------- Tin nhắn chữ
async function onText(ctx: Ctx, text: string, messageId: number) {
  const [cmd] = text.split(/\s+/, 1);
  if (cmd?.startsWith('/')) {
    await setChatState(BOT, ctx.chatId, null);
    if (cmd === '/start' || cmd === '/menu') return showHome(ctx, true);
    if (cmd === '/products') return showCategories(ctx, 0, true);
    if (cmd === '/search') return askSearch(ctx, true);
    if (cmd === '/balance' || cmd === '/deposit') return showDeposit(ctx, true);
    if (cmd === '/orders') return showOrders(ctx, 0, true);
    if (cmd === '/account') return showAccount(ctx, true);
    if (cmd === '/history') return showHistory(ctx, 0, true);
    if (cmd === '/language' || cmd === '/settings') return showSettings(ctx, true);
    return showHome(ctx, true);
  }

  // Khách dán API Key của tài khoản web -> liên kết Telegram với tài khoản đó (tin chứa key bị xóa)
  if (/^ak_\S+$/.test(text)) {
    await deleteMessage(ctx.token, ctx.chatId, messageId);
    return linkByApiKey(ctx, text);
  }
  const state = await getChatState(BOT, ctx.chatId);
  if (state === 'pw') {
    await deleteMessage(ctx.token, ctx.chatId, messageId); // không để mật khẩu nằm lại trong khung chat
    return setPassword(ctx, text);
  }
  if (state?.startsWith('qty:')) {
    if (/^\d{1,6}$/.test(text)) {
      await setChatState(BOT, ctx.chatId, null);
      return showConfirm(ctx, state.slice(4), Number(text), true);
    }
  }
  if (state?.startsWith('coupon:')) {
    const [, productId = '', qty = '1'] = state.split(':');
    await setChatState(BOT, ctx.chatId, null);
    await getRedis().set(`tg:coupon:${ctx.chatId}`, `${productId}:${text.slice(0, 40).trim().toUpperCase()}`, 'EX', 1800).catch(() => {});
    return showConfirm(ctx, productId, Number(qty), true);
  }
  if (state?.startsWith('wr:')) return submitWarranty(ctx, state.slice(3), text);
  if (state?.startsWith('wrx:')) return warrantyExtra(ctx, state, { text });
  if (state === 'pix') {
    const amount = text.replace(',', '.').replace(/[^\d.]/g, '');
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(amount)) return sendText(ctx.token, ctx.chatId, ctx.t.badAmount);
    await setChatState(BOT, ctx.chatId, null);
    return createPix(ctx, amount);
  }
  if (state?.startsWith('usdt:')) {
    if (!/^\d{1,6}$/.test(text)) return sendText(ctx.token, ctx.chatId, ctx.t.badAmount);
    await setChatState(BOT, ctx.chatId, null);
    return createUsdt(ctx, state.slice(5) as UsdtNetwork, Number(text));
  }
  // Còn lại: coi như từ khóa tìm sản phẩm
  await setChatState(BOT, ctx.chatId, null);
  if (text.length >= 2) return search(ctx, text, 0, true);
  return showHome(ctx, true);
}

async function linkAccount(ctx: Ctx, code: string) {
  const userId = await consumeLinkCode(code);
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, username: true, status: true } }) : null;
  if (!user || user.status === 'BANNED') {
    await sendText(ctx.token, ctx.chatId, ctx.t.linkInvalid);
    return;
  }
  return linkToUser(ctx, user);
}

async function linkByApiKey(ctx: Ctx, key: string) {
  const user = API_KEY_RE.test(key) ? await userByApiKey(key) : null;
  if (!user || user.status !== 'ACTIVE') return sendText(ctx.token, ctx.chatId, ctx.t.apiKeyBad, [menuRow(ctx)]);
  if (user.telegramId === String(ctx.from.id)) return showHome(ctx, true); // đã liên kết sẵn
  const ok = await linkToUser(ctx, user);
  if (!ok) return;
  // Nạp lại ngữ cảnh theo tài khoản vừa liên kết rồi hiện menu
  Object.assign(ctx, await buildCtx(ctx.settings, ctx.siteUrl, ctx.chatId, ctx.from, undefined, false));
  return showHome(ctx, true);
}

async function linkToUser(ctx: Ctx, user: { id: string; email: string; username: string | null }) {
  const telegramId = String(ctx.from.id);
  // Telegram này đang có tài khoản tự tạo còn tiền / đơn -> không gỡ (khách sẽ mất số dư), nhờ admin gộp
  const current = await prisma.user.findUnique({ where: { telegramId }, select: { id: true, email: true, username: true, balance: true, _count: { select: { orders: true } } } });
  if (current && current.id !== user.id && isTelegramPlaceholderEmail(current.email) && (current.balance.gt(0) || current._count.orders > 0)) {
    await sendText(ctx.token, ctx.chatId, tr(ctx.t, 'linkHasBalance', { account: escapeHtml(current.username ?? current.email) }));
    return false;
  }
  await prisma.$transaction([
    // 1 Telegram chỉ gắn 1 tài khoản: gỡ khỏi tài khoản cũ (nếu có)
    prisma.user.updateMany({ where: { telegramId, NOT: { id: user.id } }, data: { telegramId: null, telegramName: null } }),
    prisma.user.update({ where: { id: user.id }, data: { telegramId, telegramName: displayName(ctx.from) || null } }),
  ]);
  await sendText(ctx.token, ctx.chatId, tr(ctx.t, 'linked', { account: escapeHtml(user.username ?? user.email) }));
  return true;
}

// ---------------------------------------------------------------- Nút bấm
async function onCallback(ctx: Ctx, data: string) {
  const [kind, a = '', b = '', c = ''] = data.split(':');
  if (kind !== 'pw') await setChatState(BOT, ctx.chatId, null);
  switch (kind) {
    case 'm':
      return showHome(ctx);
    case 'cl':
      return showCategories(ctx, Number(a) || 0);
    case 'cc':
      return showSubcategories(ctx, a, Number(b) || 0);
    case 'c':
      return showProducts(ctx, { kind: 'cat', id: a }, Number(b) || 0);
    case 'ap':
      return showProducts(ctx, { kind: 'all' }, Number(a) || 0);
    case 'sr':
      return askSearch(ctx);
    case 'sq': {
      const q = await getRedis().get(`tg:q:${ctx.chatId}`).catch(() => null);
      return q ? search(ctx, q, Number(a) || 0) : askSearch(ctx);
    }
    case 'p':
      return showProduct(ctx, a);
    case 'qx':
      return askQuantity(ctx, a);
    case 'q':
      return showConfirm(ctx, a, Number(b));
    case 'cp':
      await setChatState(BOT, ctx.chatId, `coupon:${a}:${Number(b) || 1}`);
      return sendText(ctx.token, ctx.chatId, ctx.t.couponAsk);
    case 'cr':
      await getRedis().del(`tg:coupon:${ctx.chatId}`).catch(() => {});
      return showConfirm(ctx, a, Number(b));
    case 'y':
      return buy(ctx, a, Number(b), c);
    case 'b':
    case 'dp':
      return showDeposit(ctx);
    case 'px':
      return askPix(ctx);
    case 'pa':
      return createPix(ctx, a);
    case 'ut':
      return askUsdt(ctx, a === 'BEP20' ? 'BEP20' : 'TRC20');
    case 'dk':
      return checkDeposit(ctx, a);
    case 'ac':
      return showAccount(ctx);
    case 'pw':
      return askPassword(ctx);
    case 'o':
      return showOrders(ctx, Number(a) || 0);
    case 'od':
      return showOrder(ctx, a);
    case 'ak':
      return showApiKey(ctx);
    case 'akr':
      return show(ctx, false, ctx.t.apiRegenAsk, [[{ text: ctx.t.btnApiRegenYes, callback_data: 'aky' }], [{ text: ctx.t.btnBack, callback_data: 'ak' }, ...menuRow(ctx)]]);
    case 'aky':
      return showApiKey(ctx, true);
    case 'wl':
      return showWarrantyOrders(ctx, Number(a) || 0);
    case 'wr':
      return askWarranty(ctx, a);
    case 'ot':
      return sendOrderFile(ctx, a);
    case 'h':
      return showHistory(ctx, Number(a) || 0);
    case 'st':
      return showSettings(ctx);
    case 'l':
      return showLanguages(ctx);
    case 'lg':
      return setLanguage(ctx, a);
    case 'cu':
      return showCurrencies(ctx);
    case 'cs':
      return setCurrency(ctx, a);
    default:
      return showHome(ctx);
  }
}

const show = (ctx: Ctx, fresh: boolean, text: string, kb: Keyboard) => (fresh ? sendText(ctx.token, ctx.chatId, text, kb) : editOrSend(ctx.token, ctx.chatId, ctx.messageId, text, kb));
const menuRow = (ctx: Ctx) => [{ text: ctx.t.btnMenu, callback_data: 'm' }];

async function showHome(ctx: Ctx, fresh = false) {
  if (ctx.isNew) {
    await sendText(ctx.token, ctx.chatId, tr(ctx.t, 'welcomeNew', { account: escapeHtml(accountName(ctx)) }));
    // Tài khoản tự tạo có luôn API key (mua qua API / dán vào bot khác)
    if (ctx.user) {
      const key = await getApiKey(ctx.user.id, true).catch(() => null);
      if (key) await sendText(ctx.token, ctx.chatId, tr(ctx.t, 'apiKeyNew', { key }));
    }
  }
  const kb: Keyboard = [
    [
      { text: ctx.t.btnCategories, callback_data: 'cl:0' },
      { text: ctx.t.btnAllProducts, callback_data: 'ap:0' },
    ],
    [{ text: ctx.t.btnSearch, callback_data: 'sr' }],
    [
      { text: ctx.t.btnDeposit, callback_data: 'dp' },
      { text: ctx.t.btnAccount, callback_data: 'ac' },
    ],
    [
      { text: ctx.t.btnOrders, callback_data: 'o:0' },
      { text: ctx.t.btnHistory, callback_data: 'h:0' },
    ],
    [
      { text: ctx.t.btnWarranty, callback_data: 'wl:0' },
      { text: ctx.t.btnSettings, callback_data: 'st' },
    ],
    [ctx.settings.supportUrl ? { text: ctx.t.btnSupport, url: ctx.settings.supportUrl } : { text: ctx.t.btnWebsite, url: ctx.siteUrl }],
  ];
  const text = ctx.user
    ? tr(ctx.t, 'home', { site: escapeHtml(ctx.site), account: escapeHtml(accountName(ctx)), balance: money(ctx, ctx.user.balance) })
    : tr(ctx.t, 'menu', { site: escapeHtml(ctx.site) });
  return show(ctx, fresh, text, kb);
}

// ---------------------------------------------------------------- Chuyên mục (cha -> con)
type CatNode = { id: string; name: unknown; parentId: string | null; children: CatNode[]; own: number; total: number };

async function categoryTree() {
  const groups = await prisma.product.groupBy({ by: ['categoryId'], where: await listWhere(), _count: { _all: true } });
  const counts = new Map(groups.map((g) => [g.categoryId, g._count._all]));
  const cats = await prisma.category.findMany({ where: { isActive: true }, select: { id: true, name: true, parentId: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  const nodes = new Map<string, CatNode>(cats.map((c) => [c.id, { ...c, children: [], own: counts.get(c.id) ?? 0, total: 0 }]));
  const roots: CatNode[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n); // chuyên mục cha bị tắt / không có cha -> hiện ở cấp đầu
  }
  const sum = (n: CatNode, depth = 0): number => (n.total = n.own + (depth > 5 ? 0 : n.children.reduce((s, ch) => s + sum(ch, depth + 1), 0)));
  roots.forEach((r) => sum(r));
  return { roots: roots.filter((r) => r.total > 0), nodes };
}

const descendants = (n: CatNode, depth = 0): string[] => [n.id, ...(depth > 5 ? [] : n.children.flatMap((c) => descendants(c, depth + 1)))];

function pager(p: number, pages: number, data: (n: number) => string) {
  if (pages <= 1) return [];
  return [
    ...(p > 0 ? [{ text: '◀️', callback_data: data(p - 1) }] : []),
    { text: `${p + 1}/${pages}`, callback_data: data(p) },
    ...(p < pages - 1 ? [{ text: '▶️', callback_data: data(p + 1) }] : []),
  ];
}

async function showCategories(ctx: Ctx, page: number, fresh = false) {
  const { roots, nodes } = await categoryTree();
  if (!roots.length) return show(ctx, fresh, ctx.t.noProducts, [menuRow(ctx)]);
  const pages = Math.ceil(roots.length / CAT_PAGE);
  const p = Math.min(Math.max(page, 0), pages - 1);
  const kb: Keyboard = roots
    .slice(p * CAT_PAGE, (p + 1) * CAT_PAGE)
    .map((c) => [{ text: short(`${catIcon(c, nodes, ctx.locale)} ${localized(c.name, ctx.locale).toLocaleUpperCase(LOCALE_META[ctx.locale].htmlLang)} · ${c.total}${c.children.some((ch) => ch.total > 0) ? ' ›' : ''}`, 60), callback_data: `cc:${c.id}:0` }]);
  kb.push(pager(p, pages, (n) => `cl:${n}`));
  kb.push([{ text: ctx.t.btnAllProducts, callback_data: 'ap:0' }, ...menuRow(ctx)]);
  return show(ctx, fresh, `${ctx.t.categories}\n${SEP}\n${tr(ctx.t, 'catHint', { n: roots.length })}`, kb.filter((r) => r.length));
}

async function showSubcategories(ctx: Ctx, categoryId: string, page: number) {
  const { nodes } = await categoryTree();
  const node = nodes.get(categoryId);
  if (!node) return showCategories(ctx, 0);
  const kids = node.children.filter((c) => c.total > 0);
  if (!kids.length) return showProducts(ctx, { kind: 'cat', id: categoryId }, 0); // không có chuyên mục con -> vào thẳng danh sách sản phẩm
  const pages = Math.ceil(kids.length / CAT_PAGE);
  const p = Math.min(Math.max(page, 0), pages - 1);
  const name = localized(node.name, ctx.locale);
  const icon = catIcon(node, nodes, ctx.locale);
  const kb: Keyboard = [[{ text: short(tr(ctx.t, 'btnAllOf', { cat: name }) + ` · ${node.total}`, 60), callback_data: `c:${node.id}:0` }]];
  kb.push(...kids.slice(p * CAT_PAGE, (p + 1) * CAT_PAGE).map((c) => [{ text: short(`${catIcon(c, nodes, ctx.locale)} ${localized(c.name, ctx.locale)} · ${c.total}${c.children.some((ch) => ch.total > 0) ? ' ›' : ''}`, 60), callback_data: `cc:${c.id}:0` }]));
  kb.push(pager(p, pages, (n) => `cc:${categoryId}:${n}`));
  kb.push([{ text: ctx.t.btnBack, callback_data: node.parentId && nodes.has(node.parentId) ? `cc:${node.parentId}:0` : 'cl:0' }, ...menuRow(ctx)]);
  return show(ctx, false, tr(ctx.t, 'subcategories', { icon, cat: escapeHtml(name.toLocaleUpperCase(LOCALE_META[ctx.locale].htmlLang)), sep: SEP, n: node.total }), kb.filter((r) => r.length));
}

// ---------------------------------------------------------------- Danh sách sản phẩm (chuyên mục / tất cả / tìm kiếm)
async function stockOf(products: { id: string; source: string; externalStock: number | null }[]) {
  const local = products.filter((p) => p.source === 'LOCAL').map((p) => p.id);
  const rows = local.length ? await prisma.stockItem.groupBy({ by: ['productId'], where: { productId: { in: local }, status: 'AVAILABLE' }, _count: { _all: true } }) : [];
  const map = new Map(rows.map((r) => [r.productId, r._count._all]));
  return new Map(products.map((p) => [p.id, p.source === 'LOCAL' ? (map.get(p.id) ?? 0) : Math.max(p.externalStock ?? 0, 0)]));
}

// Đã bán = đơn hoàn tất thực tế + số đã bán khởi điểm admin đặt (giống "Vendidos" trên trang chủ)
async function soldOf(products: { id: string; baseSold: number }[]) {
  const rows = products.length ? await prisma.order.groupBy({ by: ['productId'], where: { productId: { in: products.map((p) => p.id) }, status: 'COMPLETED' }, _sum: { quantity: true } }) : [];
  const map = new Map(rows.map((r) => [r.productId, r._sum.quantity ?? 0]));
  return new Map(products.map((p) => [p.id, (map.get(p.id) ?? 0) + p.baseSold]));
}

type ListScope = { kind: 'cat'; id: string } | { kind: 'all' } | { kind: 'search'; q: string };

async function showProducts(ctx: Ctx, scope: ListScope, page: number, fresh = false) {
  let title = `${ctx.t.allProducts}\n${SEP}`;
  let extra: Prisma.ProductWhereInput = {};
  let back = 'cl:0';
  let pageData = (n: number) => `ap:${n}`;
  if (scope.kind === 'cat') {
    const { nodes } = await categoryTree();
    const node = nodes.get(scope.id);
    if (!node) return showCategories(ctx, 0);
    title = `${catIcon(node, nodes, ctx.locale)} <b>${escapeHtml(localized(node.name, ctx.locale).toLocaleUpperCase(LOCALE_META[ctx.locale].htmlLang))}</b>\n${SEP}`;
    extra = { categoryId: { in: descendants(node) } };
    back = node.parentId && nodes.has(node.parentId) ? `cc:${node.parentId}:0` : 'cl:0';
    pageData = (n) => `c:${scope.id}:${n}`;
  } else if (scope.kind === 'search') {
    const q = scope.q;
    title = `${tr(ctx.t, 'searchResults', { q: escapeHtml(short(q, 40)) })}\n${SEP}`;
    extra = {
      AND: [
        {
          OR: [
            { name: { path: [ctx.locale], string_contains: q, mode: 'insensitive' } },
            { name: { path: ['src'], string_contains: q, mode: 'insensitive' } },
            { name: { path: ['en'], string_contains: q, mode: 'insensitive' } },
            { category: { slug: { contains: q, mode: 'insensitive' } } },
            { slug: { contains: q.replace(/\s+/g, '-'), mode: 'insensitive' } },
          ],
        },
      ],
    };
    back = 'sr';
    pageData = (n) => `sq:${n}`;
  }

  const where = await listWhere(extra);
  const total = await prisma.product.count({ where });
  if (!total) {
    if (scope.kind === 'search') return show(ctx, fresh, tr(ctx.t, 'searchNone', { q: escapeHtml(short(scope.q, 40)) }), [[{ text: ctx.t.btnSearch, callback_data: 'sr' }, ...menuRow(ctx)]]);
    return show(ctx, fresh, ctx.t.noProducts, [menuRow(ctx)]);
  }
  const pages = Math.max(Math.ceil(total / PRODUCT_PAGE), 1);
  const p = Math.min(Math.max(page, 0), pages - 1);
  const products = await prisma.product.findMany({
    where,
    orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    skip: p * PRODUCT_PAGE,
    take: PRODUCT_PAGE,
    select: { id: true, name: true, price: true, source: true, externalStock: true, baseSold: true, categoryId: true },
  });
  const [stock, sold, tree] = await Promise.all([stockOf(products), soldOf(products), categoryTree()]);
  const iconOf = (categoryId: string) => {
    const n = tree.nodes.get(categoryId);
    return n ? catIcon(n, tree.nodes, ctx.locale) : '🔹';
  };
  const lines = products.map((x, i) => {
    const s = stock.get(x.id) ?? 0;
    const vars = { icon: iconOf(x.categoryId), n: p * PRODUCT_PAGE + i + 1, name: escapeHtml(short(localized(x.name, ctx.locale), 90)), price: money(ctx, x.price), stock: s.toLocaleString('en-US'), sold: (sold.get(x.id) ?? 0).toLocaleString('en-US') };
    return tr(ctx.t, s > 0 ? 'listLine' : 'listSoldOut', vars);
  });
  const kb: Keyboard = products.map((x, i) => [{ text: short(`${(stock.get(x.id) ?? 0) > 0 ? '🟢' : '🔴'} ${p * PRODUCT_PAGE + i + 1}. ${localized(x.name, ctx.locale)}`, 64), callback_data: `p:${x.id}` }]);
  kb.push(pager(p, pages, pageData));
  kb.push([{ text: ctx.t.btnBack, callback_data: back }, ...menuRow(ctx)]);
  const text = `${title}\n📄 <i>${tr(ctx.t, 'pageInfo', { p: p + 1, pages, total })}</i>\n\n${lines.join('\n\n')}\n\n${SEP}\n${ctx.t.pickHint}`;
  return show(ctx, fresh, text, kb.filter((r) => r.length));
}

async function askSearch(ctx: Ctx, fresh = false) {
  await setChatState(BOT, ctx.chatId, 'search');
  return show(ctx, fresh, ctx.t.searchAsk, [menuRow(ctx)]);
}

async function search(ctx: Ctx, raw: string, page: number, fresh = false) {
  const q = raw.replace(/\s+/g, ' ').trim().slice(0, 60);
  await getRedis().set(`tg:q:${ctx.chatId}`, q, 'EX', 3600).catch(() => {});
  return showProducts(ctx, { kind: 'search', q }, page, fresh);
}

// ---------------------------------------------------------------- Chi tiết + mua
async function loadProduct(productId: string) {
  return prisma.product.findFirst({
    where: { ...VISIBLE, id: productId },
    select: { id: true, name: true, description: true, price: true, minQty: true, maxQty: true, source: true, externalStock: true, categoryId: true, baseSold: true, category: { select: { name: true } } },
  });
}

async function showProduct(ctx: Ctx, productId: string, fresh = false) {
  const product = await loadProduct(productId);
  if (!product) return show(ctx, fresh, ctx.t.unavailable, [menuRow(ctx)]);
  const [stock, sold] = await Promise.all([stockOf([product]).then((m) => m.get(product.id) ?? 0), soldOf([product]).then((m) => m.get(product.id) ?? 0)]);
  const desc = descText(localized(product.description, ctx.locale));
  const tree = await categoryTree();
  const catNode = tree.nodes.get(product.categoryId);
  const lines = [
    `${catNode ? catIcon(catNode, tree.nodes, ctx.locale) : '🛍'} <b>${escapeHtml(localized(product.name, ctx.locale))}</b>`,
    SEP,
    `📂 ${ctx.t.category}: <i>${escapeHtml(localized(product.category.name, ctx.locale))}</i>`,
    `💰 ${ctx.t.price}: <b>${money(ctx, product.price)}</b>`,
    `📦 ${stock > 0 ? `${ctx.t.stock}: <b>${stock.toLocaleString('en-US')}</b> ✅` : `<b>${ctx.t.outOfStock}</b> ❌`}`,
    `🔥 ${ctx.t.sold}: <b>${sold.toLocaleString('en-US')}</b>`,
    `🔢 ${ctx.t.limits}: ${product.minQty} – ${product.maxQty.toLocaleString('en-US')}`,
    ...(desc ? ['', ctx.t.descTitle, `<blockquote expandable>${escapeHtml(short(desc, 2500))}</blockquote>`] : []),
  ];
  const max = Math.min(product.maxQty, stock);
  const kb: Keyboard = [];
  if (stock >= product.minQty) {
    const options = [...new Set([product.minQty, 1, 2, 5, 10, 20, 50])].filter((n) => n >= product.minQty && n <= max).slice(0, 5);
    kb.push(options.map((n) => ({ text: `🛒 ${n}`, callback_data: `q:${product.id}:${n}` })));
    kb.push([{ text: ctx.t.btnOtherQty, callback_data: `qx:${product.id}` }]);
    lines.push(SEP, `🛒 <b>${ctx.t.chooseQty}</b>`);
  }
  kb.push([{ text: ctx.t.btnBack, callback_data: `c:${product.categoryId}:0` }, ...menuRow(ctx)]);
  return show(ctx, fresh, lines.join('\n'), kb.filter((r) => r.length));
}

async function askQuantity(ctx: Ctx, productId: string) {
  const product = await loadProduct(productId);
  if (!product) return show(ctx, false, ctx.t.unavailable, [menuRow(ctx)]);
  await setChatState(BOT, ctx.chatId, `qty:${product.id}`);
  return sendText(ctx.token, ctx.chatId, tr(ctx.t, 'askQty', { min: product.minQty, max: product.maxQty }));
}

// Mã giảm giá khách đã nhập cho sản phẩm này (lưu 30 phút)
async function couponFor(ctx: Ctx, productId: string) {
  const v = await getRedis().get(`tg:coupon:${ctx.chatId}`).catch(() => null);
  if (!v) return undefined;
  const [pid, code] = v.split(':');
  return pid === productId && code ? code : undefined;
}

async function showConfirm(ctx: Ctx, productId: string, qty: number, fresh = false) {
  if (!ctx.user) return show(ctx, fresh, ctx.t.error, [menuRow(ctx)]);
  const product = await loadProduct(productId);
  if (!product) return show(ctx, fresh, ctx.t.unavailable, [menuRow(ctx)]);
  if (!Number.isInteger(qty) || qty < product.minQty || qty > product.maxQty) {
    await setChatState(BOT, ctx.chatId, `qty:${product.id}`);
    return sendText(ctx.token, ctx.chatId, tr(ctx.t, 'badQty', { min: product.minQty, max: product.maxQty }));
  }
  const subtotal = product.price.mul(qty);
  let total = subtotal;
  let discountLine = '';
  const code = await couponFor(ctx, product.id);
  if (code) {
    try {
      const { discount } = await evaluateCoupon(prisma, code, product.id, subtotal);
      total = subtotal.sub(discount);
      discountLine = tr(ctx.t, 'discountLine', { code: escapeHtml(code), discount: money(ctx, discount) });
    } catch (err) {
      await getRedis().del(`tg:coupon:${ctx.chatId}`).catch(() => {});
      await sendText(ctx.token, ctx.chatId, tr(ctx.t, 'couponBad', { reason: errText(ctx, err) }));
      fresh = true;
    }
  }
  const hasCoupon = !!discountLine;
  const short_ = ctx.user.balance.lt(total);
  let text = tr(ctx.t, 'confirmFull', {
    name: escapeHtml(localized(product.name, ctx.locale)),
    unit: money(ctx, product.price),
    qty,
    subtotal: money(ctx, subtotal),
    discountLine,
    total: money(ctx, total),
    balance: money(ctx, ctx.user.balance),
  });
  if (short_) text += tr(ctx.t, 'missing', { missing: money(ctx, total.sub(ctx.user.balance)) });
  // Mã ngẫu nhiên trong nút xác nhận = khóa chống mua trùng (bấm 2 lần chỉ ra 1 đơn)
  const nonce = randomBytes(6).toString('base64url');
  const couponBtn = hasCoupon ? { text: ctx.t.btnRemoveCoupon, callback_data: `cr:${product.id}:${qty}` } : { text: ctx.t.btnCoupon, callback_data: `cp:${product.id}:${qty}` };
  const kb: Keyboard = short_
    ? [[{ text: ctx.t.btnDepositNow, callback_data: 'dp' }], [couponBtn], [{ text: ctx.t.btnBack, callback_data: `p:${product.id}` }, ...menuRow(ctx)]]
    : [[{ text: ctx.t.btnConfirm, callback_data: `y:${product.id}:${qty}:${nonce}` }], [couponBtn], [{ text: ctx.t.btnCancel, callback_data: `p:${product.id}` }]];
  return show(ctx, fresh, text, kb);
}

async function buy(ctx: Ctx, productId: string, qty: number, nonce: string) {
  if (!ctx.user) return showHome(ctx);
  if (!/^[A-Za-z0-9_-]{4,16}$/.test(nonce) || !Number.isInteger(qty) || qty < 1) return showHome(ctx);
  await editOrSend(ctx.token, ctx.chatId, ctx.messageId, ctx.t.buying);
  const couponCode = await couponFor(ctx, productId);
  let result: Awaited<ReturnType<typeof purchase>>;
  try {
    result = await purchase({ userId: ctx.user.id, productId, quantity: qty, idempotencyKey: `tg:${nonce}`, couponCode });
  } catch (err) {
    if (err instanceof PurchaseError) {
      const text = err.status === 402 ? ctx.t.noBalance : err.status === 409 ? ctx.t.notEnoughStock : err.status === 404 ? ctx.t.unavailable : errText(ctx, err);
      const kb: Keyboard = err.status === 402 ? [[{ text: ctx.t.btnDepositNow, callback_data: 'dp' }], menuRow(ctx)] : [menuRow(ctx)];
      return editOrSend(ctx.token, ctx.chatId, ctx.messageId, text, kb);
    }
    throw err;
  }
  if (couponCode) await getRedis().del(`tg:coupon:${ctx.chatId}`).catch(() => {});
  if (!result.replayed) {
    // Giống mua trên web: báo nhóm Telegram admin + hoa hồng giới thiệu + tiền CTV (+ email nếu khách có email thật)
    const ref = { code: result.order.code };
    const realEmail = !isTelegramPlaceholderEmail(ctx.user.email);
    void Promise.all([
      notifyOrder(ref, 'Bot Telegram'),
      creditCommission(ref),
      creditSellerEarning(ref),
      realEmail ? getSiteUrl().then((u) => emailOrder(ref, u)) : null,
    ]).catch((e) => console.warn('[tg-shop] after order:', e instanceof Error ? e.message : e));
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
  if (o.status === 'PENDING') return sendText(ctx.token, ctx.chatId, `${tr(ctx.t, 'pending', { code: o.code })}\n${name} × ${o.quantity}`, [[{ text: ctx.t.btnOrders, callback_data: 'o:0' }], menuRow(ctx)]);
  if (o.status === 'FAILED' || o.status === 'REFUNDED') {
    if (!order.items.length) return sendText(ctx.token, ctx.chatId, tr(ctx.t, 'failed', { code: o.code, reason: escapeHtml(translateError(o.failReason ?? ctx.t[`st_${o.status}`], getDictionary(ctx.locale))) }), [menuRow(ctx)]);
  }
  if (!order.items.length) return sendText(ctx.token, ctx.chatId, tr(ctx.t, 'noItems', { code: o.code, status: ctx.t[`st_${o.status as 'COMPLETED'}`] }), [menuRow(ctx)]);
  const caption = `${tr(ctx.t, 'delivered', { code: o.code })}\n${name} × ${o.quantity} · ${money(ctx, o.totalAmount)}`;
  await sendDocument(ctx.token, ctx.chatId, `${o.code}.txt`, `${order.items.join('\n')}\n`, caption, [[{ text: ctx.t.btnWarranty, callback_data: `wr:${o.code}` }]]);
  const balance = await prisma.user.findUnique({ where: { id: ctx.user.id }, select: { balance: true } });
  if (balance) ctx.user.balance = balance.balance;
  return showHome(ctx, true);
}

// ---------------------------------------------------------------- Nạp tiền trong bot
async function usdtNetworks(): Promise<UsdtNetwork[]> {
  const out: UsdtNetwork[] = [];
  for (const n of ['TRC20', 'BEP20'] as const) {
    try {
      const cfg = await getConfig(n === 'TRC20' ? 'usdt.trc20' : 'usdt.bep20');
      if (cfg.enabled && cfg.wallet) out.push(n);
    } catch {}
  }
  return out;
}

async function showDeposit(ctx: Ctx, fresh = false) {
  if (!ctx.user) return showHome(ctx, fresh);
  const [pix, nets] = await Promise.all([getPixSettings(), usdtNetworks()]);
  const kb: Keyboard = [];
  if (pixReady(pix)) kb.push([{ text: ctx.t.btnPix, callback_data: 'px' }]);
  if (nets.length) kb.push(nets.map((n) => ({ text: tr(ctx.t, 'btnUsdt', { network: n }), callback_data: `ut:${n}` })));
  kb.push([{ text: ctx.t.btnWebDeposit, url: `${ctx.siteUrl}/dashboard/deposit` }]);
  kb.push([{ text: ctx.t.btnHistory, callback_data: 'h:0' }, ...menuRow(ctx)]);
  const text = tr(ctx.t, 'depositMenu', { balance: money(ctx, ctx.user.balance) }) + (kb.length <= 2 ? `\n\n${ctx.t.depositNone}` : '');
  return show(ctx, fresh, text, kb);
}

const fmtMoney = (ctx: Ctx, amount: number, currency: string) =>
  new Intl.NumberFormat(LOCALE_META[ctx.locale].htmlLang, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

async function askPix(ctx: Ctx) {
  const s = await getPixSettings();
  if (!pixReady(s)) return showDeposit(ctx);
  await setChatState(BOT, ctx.chatId, 'pix');
  const quick = [20, 50, 100, 200, 500].filter((n) => n >= s.minAmount && (!s.maxAmount || n <= s.maxAmount));
  const kb: Keyboard = [quick.slice(0, 3).map((n) => ({ text: fmtMoney(ctx, n, s.currency), callback_data: `pa:${n}` })), quick.slice(3).map((n) => ({ text: fmtMoney(ctx, n, s.currency), callback_data: `pa:${n}` })), [{ text: ctx.t.btnBack, callback_data: 'dp' }, ...menuRow(ctx)]];
  const text = tr(ctx.t, 'pixAsk', {
    currency: s.currency,
    min: fmtMoney(ctx, s.minAmount, s.currency),
    max: s.maxAmount ? tr(ctx.t, 'maxPart', { max: fmtMoney(ctx, s.maxAmount, s.currency) }) : '',
  });
  return show(ctx, false, text, kb.filter((r) => r.length));
}

async function createPix(ctx: Ctx, amount: string) {
  if (!ctx.user) return showHome(ctx, true);
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(amount)) return sendText(ctx.token, ctx.chatId, ctx.t.badAmount);
  const limit = await rateLimit(`deposit:pix:${ctx.user.id}`, 10, 60 * 60);
  if (!limit.ok) return sendText(ctx.token, ctx.chatId, ctx.t.tooFast);
  let dep: { id: string };
  try {
    dep = await createPixDeposit(ctx.user.id, { amount }, { callbackBase: ctx.siteUrl });
  } catch (err) {
    return sendText(ctx.token, ctx.chatId, `❌ ${errText(ctx, err)}`, [[{ text: ctx.t.btnBack, callback_data: 'px' }, ...menuRow(ctx)]]);
  }
  const t = await prisma.transaction.findUniqueOrThrow({ where: { id: dep.id }, select: { originalAmount: true, originalCurrency: true, expiresAt: true, metadata: true } });
  const code = ((t.metadata as { pix?: { code?: string } } | null)?.pix?.code ?? '').trim();
  const amountText = fmtMoney(ctx, Number(t.originalAmount ?? amount), t.originalCurrency ?? 'BRL');
  const caption = tr(ctx.t, 'pixCreated', { amount: amountText, expires: t.expiresAt ? fmtDate(ctx, t.expiresAt) : '—' });
  const png = await QRCode.toBuffer(code, { width: 600, margin: 2, errorCorrectionLevel: 'M' });
  await sendPhoto(ctx.token, ctx.chatId, png, caption);
  // Mã "copia e cola" gửi riêng để khách bấm giữ là sao chép được
  return sendText(ctx.token, ctx.chatId, tr(ctx.t, 'pixCode', { code: escapeHtml(code) }), [[{ text: ctx.t.btnCheck, callback_data: `dk:${dep.id}` }], menuRow(ctx)]);
}

async function askUsdt(ctx: Ctx, network: UsdtNetwork) {
  if (!(await usdtNetworks()).includes(network)) return showDeposit(ctx);
  const { minAmountUsd } = await getConfig('deposit');
  await setChatState(BOT, ctx.chatId, `usdt:${network}`);
  const quick = [10, 20, 50, 100, 200].filter((n) => n >= minAmountUsd);
  const kb: Keyboard = [[{ text: ctx.t.btnBack, callback_data: 'dp' }, ...menuRow(ctx)]];
  return show(ctx, false, `${tr(ctx.t, 'usdtAsk', { network, min: minAmountUsd })}${quick.length ? `\n<i>${quick.join(' · ')}</i>` : ''}`, kb);
}

async function createUsdt(ctx: Ctx, network: UsdtNetwork, amount: number) {
  if (!ctx.user) return showHome(ctx, true);
  if (network !== 'TRC20' && network !== 'BEP20') return showDeposit(ctx, true);
  const limit = await rateLimit(`deposit:create:${ctx.user.id}`, 10, 60 * 60);
  if (!limit.ok) return sendText(ctx.token, ctx.chatId, ctx.t.tooFast);
  let dep: { id: string };
  try {
    dep = await createUsdtDeposit(ctx.user.id, { network, amount });
  } catch (err) {
    return sendText(ctx.token, ctx.chatId, `❌ ${errText(ctx, err)}`, [[{ text: ctx.t.btnBack, callback_data: `ut:${network}` }, ...menuRow(ctx)]]);
  }
  const t = await prisma.transaction.findUniqueOrThrow({ where: { id: dep.id }, select: { originalAmount: true, toAddress: true, expiresAt: true } });
  const exact = Number(t.originalAmount ?? amount).toFixed(4);
  const address = t.toAddress ?? '';
  const caption = tr(ctx.t, 'usdtCreated', { network, rate: money(ctx, 1), amount: exact, address: escapeHtml(address), expires: t.expiresAt ? fmtDate(ctx, t.expiresAt) : '—' });
  const png = await QRCode.toBuffer(address, { width: 500, margin: 2 });
  return sendPhoto(ctx.token, ctx.chatId, png, caption, [[{ text: ctx.t.btnCheck, callback_data: `dk:${dep.id}` }], menuRow(ctx)]);
}

async function checkDeposit(ctx: Ctx, id: string) {
  if (!ctx.user || !/^[a-z0-9]{10,40}$/i.test(id)) return showHome(ctx, true);
  const t = await prisma.transaction.findFirst({ where: { id, userId: ctx.user.id, type: 'DEPOSIT' }, select: { status: true, method: true } });
  if (!t) return showHome(ctx, true);
  let status: string = t.status;
  if (t.method === 'PIX' && (status === 'PENDING' || status === 'EXPIRED')) status = (await checkPixDeposit(id)) ?? status;
  if (status === 'COMPLETED') {
    const u = await prisma.user.findUnique({ where: { id: ctx.user.id }, select: { balance: true } });
    if (u) ctx.user.balance = u.balance;
    // Lúc cộng tiền đã có tin "Recarga confirmada" (notifyDeposit) -> chỉ hiện lại menu với số dư mới
    return showHome(ctx, true);
  }
  if (status === 'EXPIRED' || status === 'REJECTED') return sendText(ctx.token, ctx.chatId, ctx.t.depExpired, [[{ text: ctx.t.btnDeposit, callback_data: 'dp' }], menuRow(ctx)]);
  return sendText(ctx.token, ctx.chatId, ctx.t.depPending, [[{ text: ctx.t.btnCheck, callback_data: `dk:${id}` }], menuRow(ctx)]);
}

// ---------------------------------------------------------------- Tài khoản
async function showAccount(ctx: Ctx, fresh = false) {
  if (!ctx.user) return showHome(ctx, fresh);
  const [dep, spent] = await Promise.all([
    prisma.transaction.aggregate({ where: { userId: ctx.user.id, type: 'DEPOSIT', status: 'COMPLETED' }, _sum: { amount: true } }),
    prisma.order.aggregate({ where: { userId: ctx.user.id, status: 'COMPLETED' }, _sum: { totalAmount: true } }),
  ]);
  const botAccount = isTelegramPlaceholderEmail(ctx.user.email);
  const text = tr(ctx.t, 'account', {
    username: escapeHtml(ctx.user.username ?? '—'),
    email: botAccount ? ctx.t.noEmail : escapeHtml(ctx.user.email),
    tg: escapeHtml(displayName(ctx.from) || String(ctx.from.id)),
    balance: money(ctx, ctx.user.balance),
    deposited: money(ctx, dep._sum.amount ?? 0),
    spent: money(ctx, spent._sum.totalAmount ?? 0),
    created: fmtDate(ctx, ctx.user.createdAt),
  });
  const kb: Keyboard = [];
  kb.push([...(botAccount ? [{ text: ctx.t.btnSetPassword, callback_data: 'pw' }] : []), { text: ctx.t.btnApiKey, callback_data: 'ak' }]);
  kb.push([{ text: ctx.t.btnDeposit, callback_data: 'dp' }, { text: ctx.t.btnHistory, callback_data: 'h:0' }]);
  kb.push([{ text: ctx.t.btnWebsite, url: `${ctx.siteUrl}/login` }, ...menuRow(ctx)]);
  return show(ctx, fresh, text, kb);
}

async function showApiKey(ctx: Ctx, regenerate = false) {
  if (!ctx.user) return showHome(ctx);
  if (regenerate) {
    const limit = await rateLimit(`apikey:regen:${ctx.user.id}`, 10, 3600).catch(() => ({ ok: true as const }));
    if (!limit.ok) return show(ctx, false, ctx.t.tooFast, [menuRow(ctx)]);
  }
  const key = regenerate ? await regenerateApiKey(ctx.user.id) : await getApiKey(ctx.user.id, true);
  const kb: Keyboard = [
    [{ text: ctx.t.btnDocs, url: `${ctx.siteUrl.replace(/\/+$/, '')}/dashboard/api` }],
    [{ text: ctx.t.btnApiRegen, callback_data: 'akr' }],
    [{ text: ctx.t.btnBack, callback_data: 'ac' }, ...menuRow(ctx)],
  ];
  return show(ctx, false, tr(ctx.t, 'apiKeyView', { key: escapeHtml(key ?? '') }), kb);
}

async function askPassword(ctx: Ctx) {
  if (!ctx.user) return showHome(ctx, true);
  if (!isTelegramPlaceholderEmail(ctx.user.email)) return sendText(ctx.token, ctx.chatId, ctx.t.pwNotAllowed, [menuRow(ctx)]);
  await setChatState(BOT, ctx.chatId, 'pw');
  return sendText(ctx.token, ctx.chatId, ctx.t.pwAsk);
}

async function setPassword(ctx: Ctx, password: string) {
  if (!ctx.user || !isTelegramPlaceholderEmail(ctx.user.email)) {
    await setChatState(BOT, ctx.chatId, null);
    return sendText(ctx.token, ctx.chatId, ctx.t.pwNotAllowed, [menuRow(ctx)]);
  }
  const bytes = new TextEncoder().encode(password).length;
  if (password.length < 8 || bytes > 72) return sendText(ctx.token, ctx.chatId, ctx.t.pwBad); // giữ trạng thái chờ để khách gửi lại
  await setChatState(BOT, ctx.chatId, null);
  await prisma.user.update({ where: { id: ctx.user.id }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  return sendText(ctx.token, ctx.chatId, tr(ctx.t, 'pwSaved', { site: escapeHtml(ctx.siteUrl.replace(/^https?:\/\//, '')), username: escapeHtml(ctx.user.username ?? ctx.user.email) }), [
    [{ text: ctx.t.btnWebsite, url: `${ctx.siteUrl}/login` }],
    menuRow(ctx),
  ]);
}

// ---------------------------------------------------------------- Đơn hàng
const ORDER_ICON: Record<string, string> = { COMPLETED: '✅', PENDING: '⏳', FAILED: '❌', REFUNDED: '↩️' };

async function showOrders(ctx: Ctx, page: number, fresh = false) {
  if (!ctx.user) return showHome(ctx, fresh);
  const where = { userId: ctx.user.id };
  const total = await prisma.order.count({ where });
  if (!total) return show(ctx, fresh, ctx.t.noOrders, [[{ text: ctx.t.btnAllProducts, callback_data: 'ap:0' }], menuRow(ctx)]);
  const pages = Math.ceil(total / ORDER_PAGE);
  const p = Math.min(Math.max(page, 0), pages - 1);
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: p * ORDER_PAGE,
    take: ORDER_PAGE,
    select: { code: true, status: true, quantity: true, totalAmount: true, product: { select: { name: true } } },
  });
  const kb: Keyboard = orders.map((o) => [{ text: short(`${ORDER_ICON[o.status] ?? ''} ${o.code} · ${localized(o.product.name, ctx.locale)} × ${o.quantity}`, 64), callback_data: `od:${o.code}` }]);
  kb.push(pager(p, pages, (n) => `o:${n}`));
  kb.push(menuRow(ctx));
  return show(ctx, fresh, tr(ctx.t, 'ordersPage', { total }), kb.filter((r) => r.length));
}

async function showOrder(ctx: Ctx, code: string) {
  if (!ctx.user || !/^[A-Z0-9-]{4,40}$/i.test(code)) return showOrders(ctx, 0);
  const [order, meta] = await Promise.all([
    getOrderForUser(code, ctx.user.id, ctx.locale),
    prisma.order.findFirst({ where: { code, userId: ctx.user.id }, select: { productId: true } }),
  ]);
  if (!order || !meta) return showOrders(ctx, 0);
  const o = order.order;
  let text = tr(ctx.t, 'orderDetail', {
    code: o.code,
    name: escapeHtml(o.productName),
    qty: o.quantity,
    total: money(ctx, o.totalAmount),
    status: `${ORDER_ICON[o.status] ?? ''} ${ctx.t[`st_${o.status as 'COMPLETED'}`] ?? o.status}`,
    date: fmtDate(ctx, new Date(o.createdAt)),
  });
  const joined = order.items.join('\n');
  if (order.items.length) text += joined.length <= 2500 ? tr(ctx.t, 'orderItems', { items: escapeHtml(joined) }) : tr(ctx.t, 'orderItemsFile', { n: order.items.length });
  const kb: Keyboard = [];
  if (order.items.length) kb.push([{ text: ctx.t.btnDownload, callback_data: `ot:${o.code}` }]);
  kb.push([...(o.status === 'COMPLETED' ? [{ text: ctx.t.btnWarranty, callback_data: `wr:${o.code}` }] : []), { text: ctx.t.btnBuyAgain, callback_data: `p:${meta.productId}` }]);
  kb.push([{ text: ctx.t.btnBack, callback_data: 'o:0' }, ...menuRow(ctx)]);
  return show(ctx, false, text, kb);
}

// ---------------------------------------------------------------- Bảo hành: khách chọn đơn -> gửi mô tả lỗi -> báo nhóm admin.
// Admin bấm "Trả lời" (Reply) tin đó trong nhóm -> bot admin chuyển câu trả lời cho khách qua bot này (telegram-admin.ts).
const WR_PAGE = 8;

async function showWarrantyOrders(ctx: Ctx, page: number) {
  if (!ctx.user) return showHome(ctx);
  const where = { userId: ctx.user.id, status: 'COMPLETED' as const };
  const total = await prisma.order.count({ where });
  if (!total) return show(ctx, false, ctx.t.wrNone, [[{ text: ctx.t.btnOrders, callback_data: 'o:0' }], menuRow(ctx)]);
  const pages = Math.ceil(total / WR_PAGE);
  const p = Math.min(Math.max(page, 0), pages - 1);
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: p * WR_PAGE,
    take: WR_PAGE,
    select: { code: true, quantity: true, product: { select: { name: true } } },
  });
  const kb: Keyboard = orders.map((o) => [{ text: short(`🧾 ${o.code} · ${localized(o.product.name, ctx.locale)} × ${o.quantity}`, 64), callback_data: `wr:${o.code}` }]);
  kb.push(pager(p, pages, (n) => `wl:${n}`));
  kb.push(menuRow(ctx));
  return show(ctx, false, ctx.t.wrList, kb.filter((r) => r.length));
}

async function adminGroup() {
  const s = await getTelegramSettings().catch(() => null);
  return s?.enabled && s.botToken && s.chatId ? s : null;
}

async function askWarranty(ctx: Ctx, code: string) {
  if (!ctx.user || !/^[A-Z0-9-]{4,40}$/i.test(code)) return showWarrantyOrders(ctx, 0);
  const o = await prisma.order.findFirst({ where: { code, userId: ctx.user.id, status: 'COMPLETED' }, select: { code: true, quantity: true, product: { select: { name: true } } } });
  if (!o) return showWarrantyOrders(ctx, 0);
  if (!(await adminGroup())) {
    const kb: Keyboard = [...(ctx.settings.supportUrl ? [[{ text: ctx.t.btnSupport, url: ctx.settings.supportUrl }]] : []), menuRow(ctx)];
    return sendText(ctx.token, ctx.chatId, ctx.t.wrOff, kb);
  }
  await setChatState(BOT, ctx.chatId, `wr:${o.code}`);
  return sendText(ctx.token, ctx.chatId, tr(ctx.t, 'wrAsk', { code: o.code, name: escapeHtml(`${localized(o.product.name, ctx.locale)} × ${o.quantity}`) }), [[{ text: ctx.t.btnCancel, callback_data: 'm' }]]);
}

async function submitWarranty(ctx: Ctx, code: string, raw: string, photo?: Uint8Array | null) {
  await setChatState(BOT, ctx.chatId, null);
  if (!ctx.user) return showHome(ctx, true);
  const limit = await rateLimit(`tg:wr:${ctx.user.id}`, 5, 3600).catch(() => ({ ok: true as const }));
  if (!limit.ok) return sendText(ctx.token, ctx.chatId, ctx.t.wrTooMany, [menuRow(ctx)]);
  const o = await prisma.order.findFirst({
    where: { code, userId: ctx.user.id },
    select: {
      id: true,
      code: true,
      quantity: true,
      totalAmount: true,
      createdAt: true,
      externalOrderId: true,
      product: { select: { name: true } },
      supplier: { select: { name: true, baseUrl: true } },
      user: { select: { username: true, email: true } },
    },
  });
  const group = await adminGroup();
  if (!o || !group) return sendText(ctx.token, ctx.chatId, ctx.t.wrOff, [menuRow(ctx)]);
  const pname = o.product.name as Record<string, string> | null;
  const productName = pname?.vi ?? pname?.src ?? pname?.en ?? Object.values(pname ?? {})[0] ?? '';
  const tgName = ctx.from.username ? `@${ctx.from.username}` : escapeHtml([ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || String(ctx.from.id));
  const lines = [
    '🛡 <b>YÊU CẦU BẢO HÀNH</b>',
    '━━━━━━━━━━━━━━━━',
    `👤 Khách: <b>${escapeHtml(o.user.username ?? o.user.email)}</b> · Telegram: <a href="tg://user?id=${ctx.from.id}">${tgName}</a>`,
    `🧾 Mã đơn: <code>${escapeHtml(o.code)}</code>`,
    ...(o.supplier ? [`🔗 Nguồn: ${escapeHtml(supplierDomain(o.supplier))}${o.externalOrderId ? ` · Mã đơn API: <code>#${escapeHtml(o.externalOrderId)}</code>` : ''}`] : ['🏠 Kho riêng']),
    `📦 ${escapeHtml(productName)} × ${o.quantity}`,
    `💵 ${formatUsd(o.totalAmount.toString())} · 📅 ${o.createdAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
    '',
    '💬 <b>Nội dung:</b>',
    `<blockquote>${escapeHtml(raw.slice(0, 1500))}</blockquote>`,
    '',
    group.adminCommands ? '↩️ <i>Bấm "💬 Trả lời khách" (hoặc Reply tin này) để nhắn thẳng cho khách qua bot bán hàng.</i>' : `<i>Liên hệ khách: ${tgName}</i>`,
  ];
  const buttons = group.adminCommands
    ? {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💬 Trả lời khách', callback_data: 'wrp' }, { text: '🧾 Chi tiết đơn', callback_data: `ov:${o.id}` }],
            [{ text: '💸 Hoàn tiền', callback_data: `rfn:${o.id}` }, { text: '✅ Đã xử lý', callback_data: 'wdn' }],
          ],
        },
      }
    : {};
  const sent = await tg<{ message_id: number }>(group.botToken, 'sendMessage', { chat_id: group.chatId, text: lines.join('\n').slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true, ...buttons });
  await getRedis()
    .set(warrantyKey(group.chatId, sent.message_id), JSON.stringify({ chat: ctx.chatId, code: o.code, locale: ctx.locale }), 'EX', 30 * 86400)
    .catch(() => {});
  // Ảnh kèm luôn lý do lỗi trong chú thích (nhìn ảnh là thấy lý do, không phải kéo lên tin trên)
  if (photo) {
    const reason = raw.trim() && raw !== PHOTO_ONLY ? `\n💬 <b>Lý do:</b> ${escapeHtml(raw.trim().slice(0, 800))}` : '\n💬 <i>Khách chưa ghi lý do</i>';
    await sendPhoto(group.botToken, group.chatId, photo, `📷 Ảnh lỗi · đơn <code>${escapeHtml(o.code)}</code>${reason}`, undefined, sent.message_id).catch(() => {});
  }
  // 15 phút tiếp theo: khách gửi thêm ảnh / ghi chú -> gắn vào cùng yêu cầu (trả lời tin trong nhóm)
  await setChatState(BOT, ctx.chatId, `wrx:${o.code}:${sent.message_id}`);
  await getRedis().expire(`tg:state:${BOT}:${ctx.chatId}`, 900).catch(() => {});
  const kb: Keyboard = [[{ text: ctx.t.btnWrDone, callback_data: 'm' }], ...(ctx.settings.supportUrl ? [[{ text: ctx.t.btnSupport, url: ctx.settings.supportUrl }]] : [])];
  return sendText(ctx.token, ctx.chatId, tr(ctx.t, 'wrSent', { code: o.code }), kb);
}

// Ảnh khách gửi: đang nhập lý do -> ảnh (+ chú thích) thành yêu cầu; đã gửi yêu cầu -> gửi thêm ảnh vào yêu cầu đó
const PHOTO_ONLY = '📷 (khách chỉ gửi ảnh, chưa ghi lý do)';
async function onWarrantyPhoto(ctx: Ctx, fileId: string, caption: string) {
  const state = await getChatState(BOT, ctx.chatId);
  if (!state?.startsWith('wr:') && !state?.startsWith('wrx:')) return sendText(ctx.token, ctx.chatId, ctx.t.wrPhotoHint, [[{ text: ctx.t.btnWarranty, callback_data: 'wl:0' }], menuRow(ctx)]);
  const photo = await downloadFile(ctx.token, fileId);
  if (!photo) return sendText(ctx.token, ctx.chatId, ctx.t.wrPhotoBad);
  if (state.startsWith('wr:')) return submitWarranty(ctx, state.slice(3), caption || PHOTO_ONLY, photo);
  return warrantyExtra(ctx, state, { text: caption, photo });
}

async function warrantyExtra(ctx: Ctx, state: string, add: { text?: string; photo?: Uint8Array }) {
  const [, code = '', mid = ''] = state.split(':');
  const group = await adminGroup();
  if (!group || !/^\d+$/.test(mid)) return showHome(ctx, true);
  const replyTo = Number(mid);
  const note = add.photo
    ? `📷 Ảnh khách gửi thêm · đơn <code>${escapeHtml(code)}</code>${add.text?.trim() ? `\n💬 <b>Lý do:</b> ${escapeHtml(add.text.trim().slice(0, 800))}` : ''}`
    : `💬 <b>Khách bổ sung lý do</b> · đơn <code>${escapeHtml(code)}</code>:\n<blockquote>${escapeHtml((add.text ?? '').trim().slice(0, 900))}</blockquote>`;
  if (add.photo) await sendPhoto(group.botToken, group.chatId, add.photo, note, undefined, replyTo);
  else await tg(group.botToken, 'sendMessage', { chat_id: group.chatId, text: note, parse_mode: 'HTML', reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } });
  await setChatState(BOT, ctx.chatId, state); // gia hạn thêm 15 phút
  await getRedis().expire(`tg:state:${BOT}:${ctx.chatId}`, 900).catch(() => {});
  return sendText(ctx.token, ctx.chatId, ctx.t.wrExtraSent, [[{ text: ctx.t.btnWrDone, callback_data: 'm' }]]);
}

async function sendOrderFile(ctx: Ctx, code: string) {
  if (!ctx.user || !/^[A-Z0-9-]{4,40}$/i.test(code)) return showOrders(ctx, 0, true);
  const order = await getOrderForUser(code, ctx.user.id, ctx.locale);
  if (!order?.items.length) return showOrders(ctx, 0, true);
  return sendDocument(ctx.token, ctx.chatId, `${order.order.code}.txt`, `${order.items.join('\n')}\n`, `🧾 <b>${order.order.code}</b> · ${escapeHtml(order.order.productName)} × ${order.order.quantity}`);
}

// ---------------------------------------------------------------- Lịch sử giao dịch (biến động số dư)
const TX_ICON: Record<string, string> = { DEPOSIT: '💳', PURCHASE: '🛒', REFUND: '↩️', ADJUSTMENT: '🛠', BONUS: '🎁', COMMISSION: '🤝', SELLER: '🏪' };

async function showHistory(ctx: Ctx, page: number, fresh = false) {
  if (!ctx.user) return showHome(ctx, fresh);
  const where: Prisma.TransactionWhereInput = { userId: ctx.user.id, status: 'COMPLETED' };
  const total = await prisma.transaction.count({ where });
  if (!total) return show(ctx, fresh, ctx.t.noHistory, [[{ text: ctx.t.btnDeposit, callback_data: 'dp' }], menuRow(ctx)]);
  const pages = Math.ceil(total / HISTORY_PAGE);
  const p = Math.min(Math.max(page, 0), pages - 1);
  const rows = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: p * HISTORY_PAGE,
    take: HISTORY_PAGE,
    select: { type: true, amount: true, balanceAfter: true, createdAt: true, order: { select: { code: true } } },
  });
  const lines = rows.map((r) => {
    const sign = r.amount.gte(0) ? '+' : '−';
    const label = ctx.t[`tx_${r.type}` as keyof ShopText] ?? r.type;
    const after = r.balanceAfter ? ` → ${money(ctx, r.balanceAfter)}` : '';
    return `${TX_ICON[r.type] ?? '•'} <b>${label}</b> ${sign}${money(ctx, r.amount.abs())}${r.order ? ` · ${r.order.code}` : ''}\n    <i>${fmtDate(ctx, r.createdAt)}${after}</i>`;
  });
  const kb: Keyboard = [pager(p, pages, (n) => `h:${n}`), menuRow(ctx)];
  return show(ctx, fresh, `${ctx.t.history}\n<i>${p + 1}/${pages}</i>\n\n${lines.join('\n')}`, kb.filter((r) => r.length));
}

// ---------------------------------------------------------------- Cài đặt: ngôn ngữ + tiền tệ hiển thị
async function showSettings(ctx: Ctx, fresh = false) {
  const { enabled } = await getLanguages();
  const kb: Keyboard = [];
  if (enabled.length > 1) kb.push([{ text: ctx.t.btnLanguage, callback_data: 'l' }]);
  kb.push([{ text: ctx.t.btnCurrency, callback_data: 'cu' }]);
  kb.push(menuRow(ctx));
  return show(ctx, fresh, tr(ctx.t, 'settings', { lang: LOCALE_META[ctx.locale].name, currency: ctx.fx?.currency ?? 'USD' }), kb);
}

async function showLanguages(ctx: Ctx, fresh = false) {
  const { enabled } = await getLanguages();
  const kb: Keyboard = enabled.map((l) => [{ text: `${l === ctx.locale ? '✅ ' : ''}${LOCALE_META[l].name}`, callback_data: `lg:${l}` }]);
  kb.push([{ text: ctx.t.btnBack, callback_data: 'st' }, ...menuRow(ctx)]);
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
  return showHome(ctx, true);
}

async function showCurrencies(ctx: Ctx) {
  const { currencies } = await getCurrencySettings();
  const current = ctx.fx?.currency ?? 'USD';
  const list = currencies.filter((c) => c.enabled);
  const kb: Keyboard = [];
  for (let i = 0; i < list.length; i += 2) kb.push(list.slice(i, i + 2).map((c) => ({ text: `${c.code === current ? '✅ ' : ''}${c.code} · ${c.name}`, callback_data: `cs:${c.code}` })));
  kb.push([{ text: ctx.t.btnBack, callback_data: 'st' }, ...menuRow(ctx)]);
  return show(ctx, false, ctx.t.currency, kb);
}

async function setCurrency(ctx: Ctx, code: string) {
  const { currencies } = await getCurrencySettings();
  if (!currencies.some((c) => c.code === code && c.enabled)) return showCurrencies(ctx);
  await getRedis().set(`tg:cur:${ctx.from.id}`, code, 'EX', 365 * 86400).catch(() => {});
  ctx.fx = await botFx(ctx.from.id, ctx.locale);
  await sendText(ctx.token, ctx.chatId, ctx.t.currencySaved);
  return showHome(ctx, true);
}

// Menu lệnh (nút "Menu" cạnh ô chat): theo ngôn ngữ mặc định của web. Gọi khi admin lưu bot.
const COMMANDS: Record<'pt' | 'en', [string, string][]> = {
  pt: [['start', '🏠 Menu principal'], ['products', '🛒 Ver produtos'], ['search', '🔍 Buscar produto'], ['deposit', '💳 Recarregar saldo'], ['orders', '📦 Meus pedidos'], ['account', '👤 Minha conta'], ['history', '📜 Extrato']],
  en: [['start', '🏠 Main menu'], ['products', '🛒 Browse products'], ['search', '🔍 Search products'], ['deposit', '💳 Top up balance'], ['orders', '📦 My orders'], ['account', '👤 My account'], ['history', '📜 Transactions']],
};
export async function syncShopCommands(token: string) {
  const { defaultLocale } = await getLanguages();
  const list = COMMANDS[defaultLocale === 'pt' ? 'pt' : 'en'];
  const { tg } = await import('./telegram-bot');
  await tg(token, 'setMyCommands', { commands: list.map(([command, description]) => ({ command, description })) }).catch(() => {});
}
