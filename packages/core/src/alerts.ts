// Cảnh báo tự động qua bot Telegram (Admin > Thông báo Telegram > "Cảnh báo tự động").
// - Theo sự kiện: admin thao tác / đăng nhập, thành viên mới (web gọi notifyAuditLog), nguồn API hết tiền khi giao đơn.
// - Worker kiểm tra mỗi 5 phút (runMonitor): nguồn API lỗi, kho riêng sắp hết, tiền vào ngân hàng chưa cộng, cộng tiền trùng.
// - Báo cáo cuối ngày 23:55 (sendDailyReport).
// Bảng telegram_alerts nhớ đã báo gì -> cùng 1 sự cố chỉ nhắc lại sau 6 giờ, hết sự cố báo "đã ổn định lại".
// Không bao giờ ném lỗi ra ngoài.
import { Prisma, prisma } from '@accszone/database';
import { escapeHtml, getTelegramSettings, sendTelegram, siteName, usd, type TelegramSettings } from './telegram';
import { supplierClient } from './suppliers/adapters';

export type TelegramAlertKind = keyof TelegramSettings['alerts'];

const REPEAT_HOURS = 6;
const SUPPLIER_STALE_MIN = 30;
const BANK_UNMATCHED_MIN = 15;
const HOUR = 3_600_000;
const VN_OFFSET = 7 * HOUR;

const vnTime = (d = new Date()) => d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const STAFF = ['STAFF', 'SUPER_ADMIN'];

export async function sendAlert(kind: TelegramAlertKind, html: string, opts: { time?: boolean } = {}) {
  try {
    const s = await getTelegramSettings();
    if (!s.enabled || !s.botToken || !s.chatId || !s.alerts[kind]) return false;
    await sendTelegram(s.botToken, s.chatId, opts.time === false ? html : `${html}\n🕒 ${vnTime()}`);
    return true;
  } catch (err) {
    console.warn(`[telegram] alert ${kind} failed: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

// true = chưa báo key này trong `hours` giờ qua (và ghi nhận là vừa báo)
async function claim(key: string, hours: number, state: string | null = 'sent') {
  const row = await prisma.telegramAlert.findUnique({ where: { key } });
  if (row && row.state !== null && Date.now() - row.sentAt.getTime() < hours * HOUR) return false;
  await prisma.telegramAlert.upsert({ where: { key }, update: { state, sentAt: new Date() }, create: { key, state } });
  return true;
}

// Sự cố kéo dài (nguồn API lỗi, worker dừng...): báo khi mới xảy ra / đổi nội dung, nhắc lại sau 6 giờ
async function problem(kind: TelegramAlertKind, key: string, state: string, html: string) {
  const row = await prisma.telegramAlert.findUnique({ where: { key } });
  if (row?.state === state && Date.now() - row.sentAt.getTime() < REPEAT_HOURS * HOUR) return;
  if (await sendAlert(kind, html)) await prisma.telegramAlert.upsert({ where: { key }, update: { state, sentAt: new Date() }, create: { key, state } });
}

// Hết sự cố: nếu trước đó đã báo thì gửi "đã ổn định lại"
async function resolved(kind: TelegramAlertKind, key: string, html: string) {
  const row = await prisma.telegramAlert.findUnique({ where: { key } });
  if (!row || row.state === null) return;
  await prisma.telegramAlert.update({ where: { key }, data: { state: null, sentAt: new Date() } });
  await sendAlert(kind, html);
}

export async function reportProblem(kind: TelegramAlertKind, key: string, state: string, html: string) {
  try {
    await problem(kind, key, state, html);
  } catch (err) {
    console.warn(`[telegram] problem ${key}: ${err instanceof Error ? err.message : err}`);
  }
}
export async function reportResolved(kind: TelegramAlertKind, key: string, html: string) {
  try {
    await resolved(kind, key, html);
  } catch (err) {
    console.warn(`[telegram] resolved ${key}: ${err instanceof Error ? err.message : err}`);
  }
}

const who = (u: { username: string | null; email: string } | null | undefined) => escapeHtml(u ? (u.username ?? u.email) : 'Hệ thống');

function device(ua: string) {
  if (!ua) return 'không rõ';
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Khác';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /CocCoc/.test(ua) ? 'Cốc Cốc' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Trình duyệt khác';
  return `${br} / ${os}`;
}

// ---------------------------------------------------------------- Theo sự kiện (web gọi sau writeAudit)
// Câu đầy đủ cho các thao tác hay gặp; còn lại ghép "động từ + đối tượng" (VD product.delete -> "Xóa sản phẩm")
const ACTION_TEXT: Record<string, string> = {
  'config.update': 'Thay đổi cài đặt chung',
  'security.update': 'Thay đổi cài đặt bảo mật',
  'security.admin_gate.rotate': 'Đổi link đăng nhập admin bí mật',
  'security.admin_gate.disable': 'Tắt link đăng nhập admin bí mật',
  'site.extras': 'Thay đổi cài đặt website (màu, popup, nút liên hệ, mã theo dõi)',
  'theme.upload': 'Tải lên logo / banner / ảnh giao diện',
  'theme.delete': 'Xóa ảnh giao diện',
  'currency.update': 'Thay đổi tiền tệ, tỷ giá',
  'payment.manual': 'Thay đổi cổng nạp tiền thủ công (ngân hàng / ví)',
  'payment.card': 'Thay đổi cài đặt nạp thẻ cào',
  'telegram.update': 'Thay đổi cài đặt thông báo Telegram',
  'telegram.shop.update': 'Thay đổi bot Telegram bán hàng',
  'email.update': 'Thay đổi cài đặt Email (SMTP)',
  'translate.settings': 'Thay đổi cài đặt dịch tự động',
  'translate.start': 'Bắt đầu dịch sản phẩm',
  'translate.stop': 'Dừng dịch sản phẩm',
  'translations.update': 'Sửa bản dịch giao diện',
  'languages.update': 'Thay đổi ngôn ngữ hiển thị / ngôn ngữ mặc định',
  'transaction.approve': 'Duyệt nạp tiền',
  'transaction.reject': 'Từ chối nạp tiền',
  'transaction.verify': 'Kiểm tra giao dịch nạp',
  'transaction.export': 'Xuất danh sách giao dịch',
  'user.balance.adjust': 'Cộng / trừ tiền khách',
  'balance.adjust': 'Cộng / trừ tiền khách',
  'user.role': 'Đổi phân quyền thành viên',
  'user.status': 'Khóa / mở khóa thành viên',
  'ip.block': 'Chặn IP',
  'ip.unblock': 'Bỏ chặn IP',
  'supplier.publish': 'Bật bán sản phẩm từ nguồn API',
  'product.order': 'Sắp xếp thứ tự sản phẩm',
  'order.retry': 'Giao lại đơn hàng',
  'affiliate.settings': 'Thay đổi cài đặt Affiliate',
  'affiliate.withdraw': 'Xử lý rút tiền Affiliate',
  'ctv.settings': 'Thay đổi cài đặt CTV',
  'automation.run': 'Chạy công việc tự động',
  'automation.toggle': 'Bật / tắt công việc tự động',
};
const NOUN: [RegExp, string][] = [
  [/^product\./, 'sản phẩm'],
  [/^category\./, 'chuyên mục'],
  [/^stock\./, 'kho hàng'],
  [/^supplier\./, 'kết nối API'],
  [/^coupon\./, 'mã giảm giá'],
  [/^deposit_bonus\./, 'khuyến mãi nạp tiền'],
  [/^role\./, 'vai trò admin'],
  [/^blog\.post\./, 'bài viết'],
  [/^blog\.category\./, 'chuyên mục bài viết'],
  [/^email_campaign\./, 'chiến dịch email'],
  [/^automation\./, 'công việc tự động'],
  [/^ctv\./, 'CTV'],
  [/^order\./, 'đơn hàng'],
];
const VERB: Record<string, string> = { create: 'Thêm', import: 'Nhập', update: 'Sửa', delete: 'Xóa', clear: 'Xóa hết', move: 'Chuyển', status: 'Đổi trạng thái', toggle: 'Bật / tắt', refund: 'Hoàn tiền', replace: 'Đổi hàng' };
function actionLabel(a: string) {
  if (ACTION_TEXT[a]) return ACTION_TEXT[a];
  const noun = NOUN.find(([re]) => re.test(a))?.[1];
  const verb = /^product\.bulk_/.test(a) ? 'Thao tác hàng loạt' : VERB[a.split('.').pop() ?? ''];
  return noun && verb ? `${verb} ${noun}` : noun ? `Thay đổi ${noun}` : a;
}
// [2026/11/23 09:55:00] theo giờ VN
function stamp(d = new Date()) {
  const v = new Date(d.getTime() + VN_OFFSET).toISOString();
  return `[${v.slice(0, 10).replace(/-/g, '/')} ${v.slice(11, 19)}]`;
}
// Không báo: thao tác của khách / CTV, đăng nhập (đã có loại riêng), thao tác từ chính bot Telegram
const SKIP_ACTION = /^(auth\.|seller\.|card\.|bank\.|telegram\.link|stock\.reveal)/;

export async function notifyAuditLog(auditId: string) {
  try {
    const a = await prisma.auditLog.findUnique({
      where: { id: auditId },
      select: { id: true, action: true, entity: true, entityId: true, ip: true, after: true, actorId: true, actor: { select: { username: true, email: true, role: true } } },
    });
    if (!a) return; // transaction bị rollback
    const after = (a.after && typeof a.after === 'object' ? a.after : {}) as Record<string, unknown>;
    const ip = escapeHtml(a.ip ?? 'không rõ');

    if (a.action === 'auth.register') {
      await sendAlert('newUser', `👤 <b>Thành viên mới đăng ký</b>\nTài khoản: <b>${who(a.actor)}</b>\nIP: <code>${ip}</code>`);
      return;
    }
    if (!a.actor || !STAFF.includes(a.actor.role)) return;

    if (a.action === 'auth.login_gate_denied') {
      const ua = typeof after.userAgent === 'string' ? after.userAgent : '';
      await sendAlert(
        'adminLogin',
        `⛔ <b>Chặn đăng nhập admin</b> (không qua link bí mật, mật khẩu ĐÚNG)\nTài khoản: <b>${who(a.actor)}</b>\nIP: <code>${ip}</code>\nThiết bị: ${escapeHtml(device(ua))}\nNếu không phải bạn: đổi mật khẩu tài khoản này ngay.`,
      );
      return;
    }

    if (a.action === 'auth.login') {
      const seen = a.ip ? await prisma.auditLog.count({ where: { actorId: a.actorId, action: 'auth.login', ip: a.ip, id: { not: a.id } } }) : 0;
      const ua = typeof after.userAgent === 'string' ? after.userAgent : '';
      await sendAlert(
        'adminLogin',
        `🔐 <b>Admin đăng nhập</b>${seen === 0 ? ' · ⚠️ <b>IP MỚI</b>' : ''}\nTài khoản: <b>${who(a.actor)}</b>\nIP: <code>${ip}</code>\nThiết bị: ${escapeHtml(device(ua))}`,
      );
      return;
    }
    if (SKIP_ACTION.test(a.action) || a.ip === 'telegram') return;
    await sendAlert(
      'adminAction',
      `<b>${stamp()}</b>\n- Username: <code>${who(a.actor)}</code>\n- Action: <code>${escapeHtml(actionLabel(a.action))}</code>\n- IP: <code>${ip}</code>`,
      { time: false },
    );
  } catch (err) {
    console.warn(`[telegram] audit alert failed: ${err instanceof Error ? err.message : err}`);
  }
}

// Web khởi động (sau mỗi lần "up" code mới, hoặc VPS / container khởi động lại)
export async function notifyWebStarted() {
  await sendAlert('adminAction', `<b>${stamp()}</b>\n- Username: <code>Hệ thống</code>\n- Action: <code>🚀 Cập nhật web lên phiên bản mới / khởi động lại</code>`, { time: false });
}

// Đơn RESELLER bị web nguồn từ chối / không đặt được: lý do có dấu hiệu hết tiền -> báo (mỗi nguồn tối đa 1 lần / 15 phút)
const NO_FUNDS = /insufficient|not enough|balance|fund|số dư|không đủ|hết tiền|nạp thêm|nap them|so du|khong du/i;
export async function notifySupplierNoFunds(orderId: string, reason: string) {
  try {
    if (!NO_FUNDS.test(reason)) return;
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: { code: true, quantity: true, totalAmount: true, supplierId: true, supplier: { select: { name: true } }, user: { select: { username: true, email: true } } },
    });
    if (!o?.supplierId) return;
    if (!(await claim(`nofunds:${o.supplierId}`, 0.25))) return;
    await sendAlert(
      'supplierNoFunds',
      `⚠️ <b>Nguồn API hết tiền</b>\n${escapeHtml(o.supplier?.name ?? '')}: không đủ số dư để giao đơn <code>${escapeHtml(o.code)}</code> (${o.quantity} cái, ${usd(o.totalAmount)}) của <b>${who(o.user)}</b>.\nĐơn đã được hoàn tiền cho khách. Nạp thêm tiền ở nguồn để khách mua tiếp được.\nLý do: ${escapeHtml(reason.slice(0, 300))}`,
    );
  } catch (err) {
    console.warn(`[telegram] no-funds alert failed: ${err instanceof Error ? err.message : err}`);
  }
}

// ---------------------------------------------------------------- Lỗi hệ thống (worker gọi)
export async function reportSystemError(key: string, title: string, detail: string) {
  await reportProblem('systemError', `sys:${key}`, title, `🔴 <b>Web có lỗi nghiêm trọng</b>\n${escapeHtml(title)}\n<code>${escapeHtml(detail.slice(0, 500))}</code>`);
}
export async function reportSystemOk(key: string, title: string) {
  await reportResolved('systemError', `sys:${key}`, `✅ <b>Đã ổn định lại</b>\n${escapeHtml(title)}`);
}

// ---------------------------------------------------------------- Kiểm tra định kỳ (worker, mỗi 5 phút)
async function checkSuppliers() {
  const suppliers = await prisma.supplier.findMany({ where: { isActive: true }, select: { id: true, name: true, lastSyncAt: true, createdAt: true } });
  for (const s of suppliers) {
    const key = `supplier:${s.id}`;
    const last = await prisma.auditLog.findFirst({
      where: { entity: 'Supplier', entityId: s.id, action: { in: ['supplier.sync', 'supplier.sync.failed'] } },
      orderBy: { createdAt: 'desc' },
      select: { action: true, after: true },
    });
    const since = s.lastSyncAt ?? s.createdAt;
    const staleMin = Math.floor((Date.now() - since.getTime()) / 60_000);
    let issue: string | null = null;
    if (last?.action === 'supplier.sync.failed') {
      const err = (last.after as { error?: string } | null)?.error ?? 'không rõ';
      issue = `Nguồn trả lỗi: ${err.slice(0, 300)}`;
    } else if (staleMin > SUPPLIER_STALE_MIN) {
      issue = `Đã ${staleMin} phút không đồng bộ được`;
    }
    const name = escapeHtml(s.name);
    if (issue) {
      // So sánh theo loại sự cố (không theo số phút) để không báo lại mỗi 5 phút
      const state = issue.startsWith('Đã') ? 'stale' : issue;
      await problem('supplierIssue', key, state, `🟠 <b>Nguồn API có vấn đề</b>\n${name}: ${escapeHtml(issue)}`);
    } else {
      await resolved('supplierIssue', key, `✅ <b>Nguồn API đã ổn định lại</b>\n${name} đồng bộ bình thường.`);
    }
  }
}

async function checkLowStock(s: TelegramSettings) {
  const rows = await prisma.$queryRaw<{ id: string; name: Prisma.JsonValue; stock: number }[]>(Prisma.sql`
    SELECT p.id, p.name, count(si.id)::int AS stock
    FROM products p LEFT JOIN stock_items si ON si."productId" = p.id AND si.status = 'AVAILABLE'
    WHERE p."isActive" = true AND p.source = 'LOCAL'
    GROUP BY p.id
    HAVING count(si.id) < ${s.lowStockQty}`);
  const lowIds = new Set(rows.map((r) => r.id));
  // Đã báo trước đó mà giờ đủ hàng -> xóa để lần sau hết hàng báo lại
  const alerted = await prisma.telegramAlert.findMany({ where: { key: { startsWith: 'stock:' }, state: { not: null } }, select: { key: true } });
  const restocked = alerted.map((a) => a.key.slice(6)).filter((id) => !lowIds.has(id));
  if (restocked.length) await prisma.telegramAlert.deleteMany({ where: { key: { in: restocked.map((id) => `stock:${id}`) } } });

  const fresh = [];
  for (const r of rows) if (await claim(`stock:${r.id}`, 24 * 365)) fresh.push(r);
  if (!fresh.length) return;
  const nameOf = (v: Prisma.JsonValue) => {
    const m = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, string>;
    return m.vi ?? m.src ?? m.en ?? Object.values(m)[0] ?? '';
  };
  const lines = fresh.slice(0, 25).map((r) => `• ${escapeHtml(nameOf(r.name).slice(0, 80))}: còn <b>${r.stock}</b>`);
  if (fresh.length > 25) lines.push(`… và ${fresh.length - 25} sản phẩm khác`);
  await sendAlert('lowStock', `🟡 <b>Sản phẩm kho riêng sắp hết hàng</b> (dưới ${s.lowStockQty})\n${lines.join('\n')}`);
}

async function checkBankUnmatched() {
  const rows = await prisma.auditLog.findMany({
    where: { action: 'bank.webhook.unmatched', createdAt: { gte: new Date(Date.now() - 24 * HOUR), lt: new Date(Date.now() - BANK_UNMATCHED_MIN * 60_000) } },
    select: { id: true, after: true, createdAt: true },
    take: 50,
  });
  for (const r of rows) {
    const a = (r.after ?? {}) as { reason?: string; bankRef?: string; amount?: string; description?: string; currency?: string };
    // Webhook gửi lặp lại giao dịch đã cộng -> không phải tiền bị sót
    if (/duplicate|already/.test(a.reason ?? '')) continue;
    if (a.bankRef && (await prisma.transaction.count({ where: { bankRef: a.bankRef, status: 'COMPLETED' } }))) continue;
    if (!(await claim(`bank:${r.id}`, 24 * 365))) continue;
    await sendAlert(
      'bankUnmatched',
      `🟠 <b>Tiền vào ngân hàng chưa cộng cho khách</b> (quá ${BANK_UNMATCHED_MIN} phút)\nMã GD: <code>${escapeHtml(a.bankRef ?? '?')}</code>\nSố tiền: <b>${escapeHtml(Number(a.amount ?? 0).toLocaleString('en-US'))} ${escapeHtml(a.currency ?? 'VND')}</b>\nNội dung CK: <code>${escapeHtml((a.description ?? '').slice(0, 200))}</code>\nLý do: ${escapeHtml(a.reason ?? '')}\nNhận lúc: ${vnTime(r.createdAt)}\nVào Admin → Nạp tiền để cộng tay cho khách.`,
    );
  }
}

async function checkDuplicateCredits() {
  const since = new Date(Date.now() - 7 * 24 * HOUR);
  const dups = await prisma.$queryRaw<{ ref: string; kind: string; n: number; total: string }[]>(Prisma.sql`
    SELECT ref, kind, count(*)::int AS n, sum(amount)::text AS total FROM (
      SELECT "bankRef" AS ref, 'Mã GD ngân hàng' AS kind, amount FROM transactions
      WHERE type = 'DEPOSIT' AND status = 'COMPLETED' AND "bankRef" IS NOT NULL AND "createdAt" >= ${since}
      UNION ALL
      SELECT "txHash" AS ref, 'TxHash USDT' AS kind, amount FROM transactions
      WHERE type = 'DEPOSIT' AND status = 'COMPLETED' AND "txHash" IS NOT NULL AND "createdAt" >= ${since}
    ) t GROUP BY ref, kind HAVING count(*) > 1 LIMIT 20`);
  for (const d of dups) {
    if (!(await claim(`dup:${d.ref}`, 24 * 365))) continue;
    await sendAlert(
      'duplicateCredit',
      `🔴 <b>Cộng tiền trùng</b>\n${d.kind} <code>${escapeHtml(d.ref.slice(0, 100))}</code> đã được cộng <b>${d.n} lần</b> (tổng ${usd(d.total)}).\nKiểm tra ngay ở Admin → Nạp tiền và trừ lại phần cộng thừa.`,
    );
  }
}

export async function runMonitor(log?: { warn: (m: string) => void }) {
  const s = await getTelegramSettings();
  if (!s.enabled || !s.botToken || !s.chatId) return { skipped: true };
  const steps: [TelegramAlertKind, () => Promise<unknown>][] = [
    ['supplierIssue', checkSuppliers],
    ['lowStock', () => checkLowStock(s)],
    ['bankUnmatched', checkBankUnmatched],
    ['duplicateCredit', checkDuplicateCredits],
  ];
  for (const [kind, fn] of steps) {
    if (!s.alerts[kind]) continue;
    try {
      await fn();
    } catch (err) {
      log?.warn(`monitor ${kind}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------- Báo cáo cuối ngày
export async function sendDailyReport() {
  const s = await getTelegramSettings();
  if (!s.enabled || !s.alerts.dailyReport) return { skipped: true };
  const vn = new Date(Date.now() + VN_OFFSET);
  const start = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - VN_OFFSET);

  const [orderRow, depositRow, users, suppliers] = await Promise.all([
    prisma.$queryRaw<{ orders: number; revenue: string; cost: string }[]>(Prisma.sql`
      SELECT count(*)::int AS orders,
             coalesce(sum(o."totalAmount" - coalesce(r.refund, 0)), 0)::text AS revenue,
             coalesce(sum(o.quantity * coalesce(o."unitCost", p."costPrice", 0)), 0)::text AS cost
      FROM orders o JOIN products p ON p.id = o."productId"
      LEFT JOIN (SELECT "orderId", sum(amount) AS refund FROM transactions WHERE type = 'REFUND' AND status = 'COMPLETED' AND "orderId" IS NOT NULL GROUP BY "orderId") r ON r."orderId" = o.id
      WHERE o.status = 'COMPLETED' AND o."createdAt" >= ${start}`),
    prisma.transaction.aggregate({ where: { type: 'DEPOSIT', status: 'COMPLETED', createdAt: { gte: start } }, _sum: { amount: true }, _count: true }),
    prisma.user.count({ where: { createdAt: { gte: start } } }),
    prisma.supplier.findMany({ where: { isActive: true }, select: { name: true, adapter: true, baseUrl: true, apiKeyEnc: true, priceRate: true, proxyEnc: true } }),
  ]);
  const o = orderRow[0]!;
  const revenue = Number(o.revenue);
  const balances = await Promise.all(
    suppliers.map(async (sp) => {
      try {
        const client = supplierClient(sp);
        if (!client?.getBalance) return `• ${escapeHtml(sp.name)}: không hỗ trợ xem số dư`;
        const b = await Promise.race([client.getBalance(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 10_000))]);
        return `• ${escapeHtml(sp.name)}: <b>${usd(Number(b))}</b>`;
      } catch (err) {
        return `• ${escapeHtml(sp.name)}: lỗi (${escapeHtml(err instanceof Error ? err.message.slice(0, 80) : 'không rõ')})`;
      }
    }),
  );
  const day = vn.toISOString().slice(0, 10).split('-').reverse().join('/');
  const text = [
    `📊 <b>Báo cáo cuối ngày ${day}</b> · ${escapeHtml(await siteName())}`,
    `🛒 Đơn hàng: <b>${o.orders}</b>`,
    `💵 Doanh thu: <b>${usd(revenue)}</b>`,
    `📈 Lợi nhuận ước tính: <b>${usd(revenue - Number(o.cost))}</b>`,
    `💰 Tổng nạp: <b>${usd(depositRow._sum.amount)}</b> (${depositRow._count} lượt)`,
    `👤 Thành viên mới: <b>${users}</b>`,
    balances.length ? `🏦 Số dư nguồn API:\n${balances.join('\n')}` : '🏦 Chưa có nguồn API nào đang bật',
  ].join('\n');
  await sendAlert('dailyReport', text);
  return { sent: true };
}
