// Bot admin: chính bot "Thông báo Telegram" (Admin > Thông báo Telegram), bật thêm "Nhận lệnh admin".
// Chỉ nhân viên đã liên kết Telegram (Admin > Thông báo Telegram > Kết nối Telegram của tôi) mới dùng được,
// mỗi lệnh kiểm tra đúng quyền như trên web (lib/permissions.ts) và ghi nhật ký hoạt động.
import { adjustBalance, creditDeposit, DomainError, getTelegramSettings, manualRefundOrder, notifyDeposit, rejectDeposit, supplierClient, type TelegramSettings } from '@accszone/core';
import { Prisma, prisma } from '@accszone/database';
import { periodStarts, periodStats } from './admin-stats';
import { writeAudit } from './audit';
import { invalidateCache, SHOP_STOCK_CACHE } from './cache';
import { formatUsd } from './format';
import { can, type Permission } from './permissions';
import { STAFF_ROLES } from './auth';
import { rateLimit } from './rate-limit';
import { answerCallback, consumeLinkCode, displayName, editOrSend, escapeHtml, getShopBotSettings, sendText, warrantyKey, type Keyboard, type TgMessage, type TgUpdate, type TgUser } from './telegram-bot';
import { getRedis } from './redis';
import { SHOP_TEXT, tr } from './telegram-shop-i18n';
import type { Locale } from '@/i18n/config';

const AUDIT_IP = 'telegram';
// Admin xem tên gốc (thường là tiếng Việt từ web nguồn), không phải bản dịch
const srcName = (v: unknown) => {
  const m = (v && typeof v === 'object' ? v : {}) as Record<string, string>;
  return m.vi ?? m.src ?? m.en ?? Object.values(m)[0] ?? '';
};

interface Staff {
  id: string;
  email: string;
  role: 'USER' | 'STAFF' | 'SUPER_ADMIN';
  adminRole: { permissions: string[] } | null;
}

interface Ctx {
  token: string;
  chatId: number;
  messageId?: number;
  from: TgUser;
  staff: Staff;
}

const HELP = `🤖 <b>Lệnh admin</b>
/doanhthu — doanh thu, lợi nhuận hôm nay / tuần / tháng
/sodu — số dư các nguồn API
/nap — yêu cầu nạp tiền đang chờ duyệt
/don &lt;mã đơn&gt; — tra đơn, hoàn tiền
/khach &lt;email hoặc username&gt; — xem khách
/congtien &lt;email&gt; &lt;số USD&gt; &lt;ghi chú&gt; — cộng tiền (số âm = trừ)
/sp &lt;từ khóa&gt; — tìm sản phẩm, bật/tắt bán`;

export async function handleAdminUpdate(update: TgUpdate, settings: TelegramSettings) {
  const msg = update.message;
  const cb = update.callback_query;
  const from = msg?.from ?? cb?.from;
  const chat = msg?.chat ?? cb?.message?.chat;
  if (!from || !chat) return;
  const token = settings.botToken;
  const text = msg?.text?.trim() ?? '';

  // Liên kết: /start <mã> (mã tạo ở trang admin, hết hạn sau 10 phút)
  if (chat.type === 'private' && text.startsWith('/start ')) {
    const userId = await consumeLinkCode(text.slice(7).trim());
    const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, status: true } }) : null;
    if (!user || user.status === 'BANNED' || !STAFF_ROLES.includes(user.role)) {
      await sendText(token, chat.id, '⚠️ Link đã hết hạn hoặc không hợp lệ. Mở lại Admin → Thông báo Telegram → "Kết nối Telegram của tôi".');
      return;
    }
    const telegramId = String(from.id);
    await prisma.$transaction([
      prisma.user.updateMany({ where: { telegramId, NOT: { id: user.id } }, data: { telegramId: null, telegramName: null } }),
      prisma.user.update({ where: { id: user.id }, data: { telegramId, telegramName: displayName(from) || null } }),
    ]);
    await writeAudit({ actorId: user.id, action: 'telegram.link', entity: 'User', entityId: user.id, after: { telegramId, name: displayName(from) }, ip: AUDIT_IP });
    await sendText(token, chat.id, `✅ Đã kết nối Telegram với <b>${escapeHtml(user.email)}</b>.\n\n${HELP}`);
    return;
  }

  const staff = await prisma.user.findUnique({
    where: { telegramId: String(from.id) },
    select: { id: true, email: true, role: true, status: true, adminRole: { select: { permissions: true } } },
  });
  if (!staff || staff.status === 'BANNED' || !STAFF_ROLES.includes(staff.role)) {
    // Người lạ: không trả lời trong nhóm; chat riêng thì hướng dẫn
    if (cb) await answerCallback(token, cb.id, 'Bạn chưa kết nối Telegram với tài khoản admin.');
    else if (chat.type === 'private' && text.startsWith('/')) await sendText(token, chat.id, 'Bot này chỉ dành cho quản trị viên.');
    return;
  }
  const limit = await rateLimit(`tg:admin:${from.id}`, 60, 60).catch(() => ({ ok: true as const }));
  if (!limit.ok) return;

  const ctx: Ctx = { token, chatId: chat.id, messageId: cb?.message?.message_id, from, staff };
  try {
    if (cb) {
      await onCallback(ctx, cb.data ?? '', cb.id);
    } else if (text.startsWith('/')) {
      await onCommand(ctx, text);
    } else if (msg?.reply_to_message && text) {
      await relayWarrantyReply(ctx, msg.reply_to_message, text);
    }
  } catch (err) {
    const message = DomainError.is(err) ? err.message : err instanceof Error ? err.message : String(err);
    if (!DomainError.is(err)) console.error('[telegram-admin]', err);
    if (cb) await answerCallback(token, cb.id, `❌ ${message}`);
    else await sendText(token, chat.id, `❌ ${escapeHtml(message.slice(0, 500))}`).catch(() => {});
  }
}

// Admin Reply tin "YÊU CẦU BẢO HÀNH" trong nhóm -> gửi câu trả lời cho khách qua bot bán hàng
async function relayWarrantyReply(ctx: Ctx, replied: TgMessage, text: string) {
  const raw = await getRedis().get(warrantyKey(ctx.chatId, replied.message_id)).catch(() => null);
  if (!raw) return; // reply tin khác trong nhóm -> bỏ qua
  const t = JSON.parse(raw) as { chat: number; code: string; locale: Locale };
  const shop = await getShopBotSettings();
  if (!shop.enabled || !shop.botToken) return sendText(ctx.token, ctx.chatId, '⚠️ Bot bán hàng đang tắt, không gửi được cho khách.');
  const st = SHOP_TEXT[t.locale] ?? SHOP_TEXT.en;
  await sendText(shop.botToken, t.chat, tr(st, 'wrReply', { code: escapeHtml(t.code), text: escapeHtml(text.slice(0, 3500)) }), [[{ text: st.btnWarranty, callback_data: `wr:${t.code}` }, { text: st.btnMenu, callback_data: 'm' }]]);
  await writeAudit({ actorId: ctx.staff.id, action: 'telegram.warranty.reply', entity: 'Order', entityId: t.code, after: { text: text.slice(0, 500) }, ip: AUDIT_IP });
  return sendText(ctx.token, ctx.chatId, `✅ Đã gửi trả lời cho khách (đơn <code>${escapeHtml(t.code)}</code>).`);
}

function allowed(ctx: Ctx, perm: Permission) {
  return can(ctx.staff, perm);
}
const deny = (ctx: Ctx) => sendText(ctx.token, ctx.chatId, '⛔ Bạn không có quyền thực hiện lệnh này.');

async function onCommand(ctx: Ctx, text: string) {
  const [rawCmd = '', ...rest] = text.split(/\s+/);
  const cmd = rawCmd.split('@')[0]!.toLowerCase(); // /lenh@ten_bot trong nhóm
  const arg = rest.join(' ').trim();
  switch (cmd) {
    case '/start':
    case '/help':
      return sendText(ctx.token, ctx.chatId, HELP);
    case '/doanhthu':
      return allowed(ctx, 'dashboard.view') ? revenue(ctx) : deny(ctx);
    case '/sodu':
      return allowed(ctx, 'suppliers.view') ? supplierBalances(ctx) : deny(ctx);
    case '/nap':
      return allowed(ctx, 'payments.view') ? pendingDeposits(ctx) : deny(ctx);
    case '/don':
      return allowed(ctx, 'orders.view') ? showOrder(ctx, arg) : deny(ctx);
    case '/khach':
      return allowed(ctx, 'users.view') ? showCustomer(ctx, arg) : deny(ctx);
    case '/congtien':
      return allowed(ctx, 'users.balance') ? addBalance(ctx, rest) : deny(ctx);
    case '/sp':
      return allowed(ctx, 'products.view') ? searchProducts(ctx, arg) : deny(ctx);
    default:
      return sendText(ctx.token, ctx.chatId, HELP);
  }
}

async function onCallback(ctx: Ctx, data: string, cbId: string) {
  const [kind, id = ''] = data.split(':');
  switch (kind) {
    case 'ap':
      if (!allowed(ctx, 'payments.edit')) return answerCallback(ctx.token, cbId, '⛔ Không có quyền duyệt nạp tiền');
      return approveDeposit(ctx, id, cbId);
    case 'rj':
      if (!allowed(ctx, 'payments.edit')) return answerCallback(ctx.token, cbId, '⛔ Không có quyền duyệt nạp tiền');
      return rejectDepositCb(ctx, id, cbId);
    case 'rf':
      if (!allowed(ctx, 'orders.refund')) return answerCallback(ctx.token, cbId, '⛔ Không có quyền hoàn tiền');
      await answerCallback(ctx.token, cbId);
      return editOrSend(ctx.token, ctx.chatId, ctx.messageId, '⚠️ Hoàn <b>toàn bộ</b> tiền đơn này cho khách?', [[{ text: '✅ Đồng ý hoàn tiền', callback_data: `rfy:${id}` }, { text: '✖️ Hủy', callback_data: `od:${id}` }]]);
    case 'rfy':
      if (!allowed(ctx, 'orders.refund')) return answerCallback(ctx.token, cbId, '⛔ Không có quyền hoàn tiền');
      return refundOrder(ctx, id, cbId);
    case 'od': {
      await answerCallback(ctx.token, cbId);
      const o = await prisma.order.findUnique({ where: { id }, select: { code: true } });
      return o ? showOrder(ctx, o.code, true) : undefined;
    }
    case 'tp':
      if (!allowed(ctx, 'products.edit')) return answerCallback(ctx.token, cbId, '⛔ Không có quyền sửa sản phẩm');
      return toggleProduct(ctx, id, cbId);
    default:
      return answerCallback(ctx.token, cbId);
  }
}

// ---------------------------------------------------------------- Thống kê
async function revenue(ctx: Ctx) {
  const p = periodStarts();
  const [today, week, month] = await Promise.all([periodStats(p.today), periodStats(p.week), periodStats(p.month)]);
  const line = (label: string, s: Awaited<ReturnType<typeof periodStats>>) =>
    `<b>${label}</b>: ${s.orders} đơn · doanh thu <b>${formatUsd(s.revenue)}</b> · lãi <b>${formatUsd(s.profit)}</b> · ${s.users} khách mới`;
  return sendText(ctx.token, ctx.chatId, ['📊 <b>Doanh thu</b>', line('Hôm nay', today), line('Tuần này', week), line('Tháng này', month)].join('\n'));
}

async function supplierBalances(ctx: Ctx) {
  const suppliers = await prisma.supplier.findMany({ orderBy: { createdAt: 'asc' } });
  if (!suppliers.length) return sendText(ctx.token, ctx.chatId, 'Chưa có nguồn API nào.');
  const rows = await Promise.all(
    suppliers.map(async (s) => {
      if (!s.isActive) return `⚪ ${escapeHtml(s.name)}: đang tắt`;
      try {
        const client = supplierClient(s);
        if (!client.getBalance) return `⚪ ${escapeHtml(s.name)}: nguồn không có API số dư`;
        const value = await Promise.race([client.getBalance(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('quá thời gian chờ')), 8_000))]);
        return `🟢 ${escapeHtml(s.name)}: <b>${formatUsd(Number(value))}</b>`;
      } catch (err) {
        return `🔴 ${escapeHtml(s.name)}: ${escapeHtml((err instanceof Error ? err.message : String(err)).slice(0, 100))}`;
      }
    }),
  );
  return sendText(ctx.token, ctx.chatId, ['💼 <b>Số dư nguồn API</b>', ...rows].join('\n'));
}

// ---------------------------------------------------------------- Nạp tiền
const METHOD: Record<string, string> = { USDT_TRC20: 'USDT TRC20', USDT_BEP20: 'USDT BEP20', BANK_TRANSFER: 'Ngân hàng', MOMO: 'MoMo', CUSTOM: 'Nạp thủ công', CARD: 'Thẻ cào', PIX: 'PIX' };

export function depositText(t: { id: string; method: string; amount: Prisma.Decimal; customerRef: string | null; bankRef: string | null; transferCode: string | null; originalAmount: Prisma.Decimal | null; originalCurrency: string | null; proofImageUrl: string | null; user: { email: string; username: string | null } }) {
  return [
    `💳 <b>Yêu cầu nạp chờ duyệt</b>`,
    `Khách: <b>${escapeHtml(t.user.username ?? t.user.email)}</b>`,
    `Phương thức: ${METHOD[t.method] ?? t.method}`,
    `Số tiền: <b>${formatUsd(t.amount)}</b>${t.originalAmount && t.originalCurrency ? ` (${Number(t.originalAmount).toLocaleString('en-US')} ${t.originalCurrency})` : ''}`,
    ...(t.transferCode ? [`Nội dung CK: <code>${escapeHtml(t.transferCode)}</code>`] : []),
    ...(t.customerRef ? [`Mã GD khách khai: <code>${escapeHtml(t.customerRef)}</code>`] : []),
    ...(t.method === 'PIX' && t.bankRef ? [`Mã PIX: <code>${escapeHtml(t.bankRef.replace(/^pix:/, ''))}</code> (đối chiếu bên cổng PIX)`] : []),
    ...(t.proofImageUrl ? ['📎 Có biên lai (xem trên web)'] : []),
  ].join('\n');
}

// Chống mã trùng: mã GD khách khai đã xuất hiện ở yêu cầu nạp khác (dùng lại biên lai / 1 lần trả báo cho 2 lệnh)
async function duplicateRefs(t: { id: string; customerRef: string | null; bankRef: string | null }) {
  const or: Prisma.TransactionWhereInput[] = [];
  const ref = t.customerRef?.trim();
  if (ref) or.push({ customerRef: { equals: ref, mode: 'insensitive' } }, { bankRef: { equals: ref, mode: 'insensitive' } });
  if (t.bankRef) or.push({ bankRef: t.bankRef });
  if (!or.length) return [];
  return prisma.transaction.findMany({
    where: { type: 'DEPOSIT', id: { not: t.id }, status: { in: ['PENDING', 'COMPLETED'] }, OR: or },
    select: { id: true, status: true, amount: true, user: { select: { email: true, username: true } } },
    take: 5,
  });
}

function duplicateText(list: Awaited<ReturnType<typeof duplicateRefs>>) {
  if (!list.length) return '';
  const done = list.filter((x) => x.status === 'COMPLETED').length;
  return [
    '',
    `⚠️ <b>MÃ TRÙNG</b>: mã giao dịch này đã có ở ${list.length} yêu cầu nạp khác${done ? ` (${done} đã được cộng tiền)` : ''}:`,
    ...list.map((x) => `• ${escapeHtml(x.user.username ?? x.user.email)} · ${formatUsd(x.amount)} · ${x.status === 'COMPLETED' ? 'đã duyệt' : 'đang chờ'}`),
    'Không duyệt qua Telegram được, kiểm tra kỹ trên web.',
  ].join('\n');
}

export const depositButtons = (id: string): Keyboard => [[{ text: '✅ Duyệt', callback_data: `ap:${id}` }, { text: '❌ Từ chối', callback_data: `rj:${id}` }]];

const depositSelect = {
  id: true,
  method: true,
  amount: true,
  customerRef: true,
  bankRef: true,
  transferCode: true,
  originalAmount: true,
  originalCurrency: true,
  proofImageUrl: true,
  network: true,
  txHash: true,
  user: { select: { email: true, username: true } },
} satisfies Prisma.TransactionSelect;

async function pendingDeposits(ctx: Ctx) {
  const list = await prisma.transaction.findMany({
    where: { type: 'DEPOSIT', status: 'PENDING', claimedAt: { not: null } },
    orderBy: { claimedAt: 'asc' },
    take: 10,
    select: depositSelect,
  });
  if (!list.length) return sendText(ctx.token, ctx.chatId, '✅ Không có yêu cầu nạp nào đang chờ duyệt.');
  for (const t of list) {
    const dup = await duplicateRefs(t);
    await sendText(ctx.token, ctx.chatId, depositText(t) + duplicateText(dup), dup.length ? undefined : depositButtons(t.id));
  }
}

async function approveDeposit(ctx: Ctx, id: string, cbId: string) {
  const t = await prisma.transaction.findFirst({ where: { id, type: 'DEPOSIT' }, select: { ...depositSelect, status: true } });
  if (!t) return answerCallback(ctx.token, cbId, 'Không tìm thấy yêu cầu nạp');
  // USDT duyệt tay phải có TxID để chặn cộng tiền 2 lần cho 1 giao dịch -> làm trên web
  if (t.network && !t.txHash) return answerCallback(ctx.token, cbId, 'Nạp USDT cần nhập TxID: hãy duyệt trên trang web.');
  // Mã GD trùng với yêu cầu khác -> không cho duyệt nhanh qua Telegram
  const dup = await duplicateRefs(t);
  if (dup.length) {
    await answerCallback(ctx.token, cbId, '⚠️ Mã giao dịch trùng với yêu cầu khác, hãy kiểm tra và duyệt trên web.');
    return editOrSend(ctx.token, ctx.chatId, ctx.messageId, depositText(t) + duplicateText(dup));
  }
  const result = await prisma.$transaction((tx) => creditDeposit(tx, id, { reviewedById: ctx.staff.id, note: 'Duyệt qua Telegram' }));
  await writeAudit({ actorId: ctx.staff.id, action: 'transaction.approve', entity: 'Transaction', entityId: id, before: { status: t.status, amount: t.amount }, after: { status: 'COMPLETED', amount: result.amount, via: 'telegram' }, ip: AUDIT_IP });
  await answerCallback(ctx.token, cbId, '✅ Đã duyệt');
  await editOrSend(ctx.token, ctx.chatId, ctx.messageId, `${depositText(t)}\n\n✅ <b>Đã duyệt</b> bởi ${escapeHtml(ctx.staff.email)} · số dư khách: ${formatUsd(result.balanceAfter)}`);
  void notifyDeposit(id);
}

async function rejectDepositCb(ctx: Ctx, id: string, cbId: string) {
  const t = await prisma.transaction.findFirst({ where: { id, type: 'DEPOSIT' }, select: depositSelect });
  if (!t) return answerCallback(ctx.token, cbId, 'Không tìm thấy yêu cầu nạp');
  await rejectDeposit(id, ctx.staff.id, 'Từ chối qua Telegram');
  await writeAudit({ actorId: ctx.staff.id, action: 'transaction.reject', entity: 'Transaction', entityId: id, after: { status: 'REJECTED', via: 'telegram' }, ip: AUDIT_IP });
  await answerCallback(ctx.token, cbId, 'Đã từ chối');
  await editOrSend(ctx.token, ctx.chatId, ctx.messageId, `${depositText(t)}\n\n❌ <b>Đã từ chối</b> bởi ${escapeHtml(ctx.staff.email)}`);
}

// ---------------------------------------------------------------- Đơn hàng
const STATUS: Record<string, string> = { COMPLETED: '✅ Hoàn tất', PENDING: '⏳ Đang xử lý', FAILED: '❌ Lỗi', REFUNDED: '↩️ Đã hoàn tiền' };

async function showOrder(ctx: Ctx, code: string, edit = false) {
  if (!code) return sendText(ctx.token, ctx.chatId, 'Cú pháp: /don &lt;mã đơn&gt;');
  const o = await prisma.order.findFirst({
    where: { code: { equals: code.trim(), mode: 'insensitive' } },
    select: {
      id: true,
      code: true,
      status: true,
      quantity: true,
      totalAmount: true,
      unitCost: true,
      failReason: true,
      createdAt: true,
      user: { select: { email: true, username: true } },
      product: { select: { name: true } },
      supplier: { select: { name: true } },
    },
  });
  if (!o) return sendText(ctx.token, ctx.chatId, `Không tìm thấy đơn <code>${escapeHtml(code)}</code>.`);
  const text = [
    `🧾 <b>Đơn ${o.code}</b> — ${STATUS[o.status] ?? o.status}`,
    `Sản phẩm: ${escapeHtml(srcName(o.product.name))} × ${o.quantity}`,
    `Khách: ${escapeHtml(o.user.username ?? o.user.email)}`,
    `Thành tiền: <b>${formatUsd(o.totalAmount)}</b>${o.unitCost ? ` · vốn ${formatUsd(o.unitCost.mul(o.quantity))}` : ''}`,
    `Nguồn: ${o.supplier ? escapeHtml(o.supplier.name) : 'Kho riêng'}`,
    `Thời gian: ${o.createdAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
    ...(o.failReason ? [`Lý do: ${escapeHtml(o.failReason)}`] : []),
  ].join('\n');
  const kb: Keyboard = o.status === 'COMPLETED' || o.status === 'PENDING' ? [[{ text: '💸 Hoàn tiền toàn bộ', callback_data: `rf:${o.id}` }]] : [];
  return edit ? editOrSend(ctx.token, ctx.chatId, ctx.messageId, text, kb) : sendText(ctx.token, ctx.chatId, text, kb);
}

async function refundOrder(ctx: Ctx, orderId: string, cbId: string) {
  const result = await manualRefundOrder({ orderId, actorId: ctx.staff.id, reason: 'Hoàn tiền qua Telegram' });
  await answerCallback(ctx.token, cbId, `✅ Đã hoàn ${formatUsd(result.amount)}`);
  return showOrder(ctx, (await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { code: true } })).code, true);
}

// ---------------------------------------------------------------- Khách hàng
async function findCustomer(q: string) {
  const v = q.trim();
  if (!v) return null;
  return prisma.user.findFirst({
    where: { OR: [{ email: { equals: v, mode: 'insensitive' } }, { username: { equals: v, mode: 'insensitive' } }] },
    select: { id: true, email: true, username: true, balance: true, status: true, role: true, createdAt: true, telegramName: true },
  });
}

async function showCustomer(ctx: Ctx, q: string) {
  if (!q) return sendText(ctx.token, ctx.chatId, 'Cú pháp: /khach &lt;email hoặc username&gt;');
  const u = await findCustomer(q);
  if (!u) return sendText(ctx.token, ctx.chatId, 'Không tìm thấy khách này.');
  const [orders, deposits] = await Promise.all([
    prisma.order.aggregate({ where: { userId: u.id, status: 'COMPLETED' }, _count: true, _sum: { totalAmount: true } }),
    prisma.transaction.aggregate({ where: { userId: u.id, type: 'DEPOSIT', status: 'COMPLETED' }, _sum: { amount: true } }),
  ]);
  return sendText(
    ctx.token,
    ctx.chatId,
    [
      `👤 <b>${escapeHtml(u.username ?? u.email)}</b>${u.status === 'BANNED' ? ' · 🔒 bị khóa' : ''}`,
      `Email: ${escapeHtml(u.email)}`,
      `Số dư: <b>${formatUsd(u.balance)}</b>`,
      `Đã nạp: ${formatUsd(deposits._sum.amount)} · Đã mua: ${orders._count} đơn (${formatUsd(orders._sum.totalAmount)})`,
      `Telegram: ${u.telegramName ? escapeHtml(u.telegramName) : 'chưa kết nối'}`,
      `Đăng ký: ${u.createdAt.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
    ].join('\n'),
  );
}

async function addBalance(ctx: Ctx, args: string[]) {
  const [who = '', amountRaw = '', ...noteParts] = args;
  const note = noteParts.join(' ').trim();
  if (!who || !/^-?\d+(\.\d{1,6})?$/.test(amountRaw) || Number(amountRaw) === 0 || !note) {
    return sendText(ctx.token, ctx.chatId, 'Cú pháp: /congtien &lt;email&gt; &lt;số USD&gt; &lt;ghi chú&gt;\nVD: /congtien khach@gmail.com 10 bù đơn lỗi (số âm = trừ tiền)');
  }
  const u = await findCustomer(who);
  if (!u) return sendText(ctx.token, ctx.chatId, 'Không tìm thấy khách này.');
  const tx = await adjustBalance(ctx.staff.id, u.id, new Prisma.Decimal(amountRaw).toFixed(6), `${note} (qua Telegram)`.slice(0, 500));
  await writeAudit({ actorId: ctx.staff.id, action: 'balance.adjust', entity: 'User', entityId: u.id, after: { amount: amountRaw, note, via: 'telegram' }, ip: AUDIT_IP });
  return sendText(ctx.token, ctx.chatId, `✅ ${Number(amountRaw) > 0 ? 'Đã cộng' : 'Đã trừ'} <b>${formatUsd(Math.abs(Number(amountRaw)))}</b> cho ${escapeHtml(u.username ?? u.email)}. Số dư mới: <b>${formatUsd(tx.balanceAfter)}</b>`);
}

// ---------------------------------------------------------------- Sản phẩm
const productLine = (p: { name: Prisma.JsonValue; price: Prisma.Decimal; isActive: boolean }) => `${p.isActive ? '🟢' : '⚪'} ${srcName(p.name)} · ${formatUsd(p.price)}`;

async function searchProducts(ctx: Ctx, q: string) {
  if (q.length < 2) return sendText(ctx.token, ctx.chatId, 'Cú pháp: /sp &lt;từ khóa&gt; (ít nhất 2 ký tự)');
  const ids = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM products WHERE name::text ILIKE ${`%${q}%`} ORDER BY "isActive" DESC, "updatedAt" DESC LIMIT 10`;
  if (!ids.length) return sendText(ctx.token, ctx.chatId, 'Không tìm thấy sản phẩm nào.');
  const products = await prisma.product.findMany({ where: { id: { in: ids.map((r) => r.id) } }, select: { id: true, name: true, price: true, isActive: true } });
  const kb: Keyboard = products.map((p) => [{ text: productLine(p).slice(0, 60), callback_data: `tp:${p.id}` }]);
  return sendText(ctx.token, ctx.chatId, `🔎 Kết quả cho "<b>${escapeHtml(q)}</b>" — bấm để bật/tắt bán (🟢 đang bán, ⚪ đang tắt):`, kb);
}

async function toggleProduct(ctx: Ctx, id: string, cbId: string) {
  const p = await prisma.product.findUnique({ where: { id }, select: { isActive: true, name: true } });
  if (!p) return answerCallback(ctx.token, cbId, 'Không tìm thấy sản phẩm');
  const updated = await prisma.product.update({ where: { id }, data: { isActive: !p.isActive }, select: { id: true, name: true, price: true, isActive: true } });
  await invalidateCache(SHOP_STOCK_CACHE);
  await writeAudit({ actorId: ctx.staff.id, action: 'product.update', entity: 'Product', entityId: id, before: { isActive: p.isActive }, after: { isActive: updated.isActive, via: 'telegram' }, ip: AUDIT_IP });
  await answerCallback(ctx.token, cbId, updated.isActive ? '🟢 Đã bật bán' : '⚪ Đã tắt bán');
  return sendText(ctx.token, ctx.chatId, `${productLine(updated)}\n${updated.isActive ? 'Đã <b>bật</b> bán.' : 'Đã <b>tắt</b> bán.'}`, [[{ text: updated.isActive ? '⚪ Tắt bán' : '🟢 Bật bán', callback_data: `tp:${id}` }]]);
}

// Khách bấm "Tôi đã chuyển khoản" -> báo vào chat Thông báo Telegram, kèm nút Duyệt / Từ chối (khi đã bật lệnh admin)
export async function notifyDepositClaim(id: string) {
  try {
    const s = await getTelegramSettings();
    if (!s.enabled || !s.botToken || !s.chatId || !s.events.deposit) return;
    const t = await prisma.transaction.findFirst({ where: { id, type: 'DEPOSIT', status: 'PENDING' }, select: depositSelect });
    if (!t) return;
    const dup = await duplicateRefs(t);
    await sendText(s.botToken, s.chatId, depositText(t) + duplicateText(dup), s.adminCommands && !dup.length ? depositButtons(t.id) : undefined);
  } catch (err) {
    console.warn(`[telegram] deposit claim notify failed: ${err instanceof Error ? err.message : err}`);
  }
}
