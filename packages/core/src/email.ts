// Gửi email qua SMTP (Admin > Email). Dùng chung cho web (email tự động) và worker (chiến dịch).
// Email tự động không bao giờ ném lỗi ra ngoài: gửi mail lỗi không được làm hỏng đơn hàng / đăng nhập.
import { createHmac, timingSafeEqual } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import { prisma } from '@accszone/database';
import { getConfig, type ConfigValue } from './config';

export type EmailSettings = ConfigValue<'email'>;
export type EmailTemplateKey = keyof EmailSettings['templates'];

export const EMAIL_VARIABLES: Record<EmailTemplateKey | 'campaign', [string, string][]> = {
  order: [['site', 'Tên website'], ['username', 'Tên khách'], ['code', 'Mã đơn'], ['product', 'Sản phẩm'], ['amount', 'Số lượng'], ['pay', 'Thành tiền'], ['link', 'Link xem đơn'], ['time', 'Thời gian']],
  loginAlert: [['site', 'Tên website'], ['username', 'Tên khách'], ['ip', 'IP đăng nhập'], ['device', 'Trình duyệt / thiết bị'], ['time', 'Thời gian']],
  campaign: [['site', 'Tên website'], ['username', 'Tên khách'], ['email', 'Email khách']],
};

export const EMAIL_DEFAULTS: EmailSettings = {
  enabled: false,
  host: 'smtp.gmail.com',
  port: 587,
  secure: 'tls',
  user: '',
  pass: '',
  fromEmail: '',
  fromName: '',
  templates: {
    order: {
      enabled: true,
      subject: 'Đơn hàng {code} - {site}',
      body: '<p>Chào {username},</p><p>Cảm ơn bạn đã mua hàng tại <b>{site}</b>.</p><ul><li>Mã đơn: <b>{code}</b></li><li>Sản phẩm: {product}</li><li>Số lượng: {amount}</li><li>Thanh toán: {pay}</li></ul><p>Xem và tải tài khoản tại: <a href="{link}">{link}</a></p><p>Để an toàn, hãy đổi mật khẩu các tài khoản ngay sau khi nhận.</p>',
    },
    loginAlert: {
      enabled: false,
      subject: 'Cảnh báo đăng nhập - {site}',
      body: '<p>Chào {username},</p><p>Tài khoản của bạn vừa đăng nhập vào <b>{site}</b>.</p><ul><li>Thời gian: {time}</li><li>IP: {ip}</li><li>Thiết bị: {device}</li></ul><p>Nếu không phải bạn, hãy đổi mật khẩu ngay và liên hệ hỗ trợ.</p>',
    },
  },
};

const TTL_MS = 60_000;
let cached: { value: EmailSettings; at: number } | null = null;
let transport: { key: string; t: Transporter } | null = null;

export function clearEmailCache() {
  cached = null;
  transport = null;
}

export async function getEmailSettings(): Promise<EmailSettings> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  let value = EMAIL_DEFAULTS;
  try {
    value = await getConfig('email');
  } catch {}
  cached = { value, at: Date.now() };
  return value;
}

export const smtpReady = (s: EmailSettings) => s.enabled && !!s.host && !!s.user && !!s.pass;

function transporter(s: Pick<EmailSettings, 'host' | 'port' | 'secure' | 'user' | 'pass'>) {
  const key = JSON.stringify([s.host, s.port, s.secure, s.user, s.pass]);
  if (transport?.key === key) return transport.t;
  const t = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure === 'ssl',
    requireTLS: s.secure === 'tls',
    auth: { user: s.user, pass: s.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  transport = { key, t };
  return t;
}

const escapeHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const htmlToText = (html: string) =>
  html.replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

// Thay {biến}: giá trị luôn escape (dữ liệu khách nhập); subject là văn bản thuần nên không escape
export function fillTemplate(template: string, vars: Record<string, string>, html = true) {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? (html ? escapeHtml(vars[k]!) : vars[k]!) : m));
}

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  cc?: string;
  bcc?: string;
  headers?: Record<string, string>;
}

// Gửi 1 email; ném lỗi nếu SMTP lỗi (nơi gọi tự quyết định xử lý)
export async function sendMail(input: MailInput, settings?: EmailSettings) {
  const s = settings ?? (await getEmailSettings());
  if (!s.host || !s.user || !s.pass) throw new Error('Chưa cấu hình SMTP');
  const from = s.fromEmail || s.user;
  await transporter(s).sendMail({
    from: s.fromName ? { name: s.fromName, address: from } : from,
    to: input.to,
    cc: input.cc || undefined,
    bcc: input.bcc || undefined,
    subject: input.subject.replace(/[\r\n]+/g, ' ').slice(0, 300),
    html: input.html,
    text: htmlToText(input.html),
    headers: input.headers,
  });
}

async function siteName() {
  try {
    return (await getConfig('site.general')).name;
  } catch {
    return 'Shop';
  }
}

const timeVN = () => new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

async function sendTemplate(key: EmailTemplateKey, to: string, vars: Record<string, string>) {
  try {
    const s = await getEmailSettings();
    const t = s.templates[key];
    if (!smtpReady(s) || !t.enabled || !t.subject.trim() || !t.body.trim()) return;
    const all = { site: await siteName(), time: timeVN(), ...vars };
    await sendMail({ to, subject: fillTemplate(t.subject, all, false), html: fillTemplate(t.body, all) }, s);
  } catch (err) {
    console.warn(`[email] ${key} to ${to} failed: ${err instanceof Error ? err.message : err}`);
  }
}

// Email xác nhận đơn hàng (không gửi nội dung tài khoản qua email, chỉ link xem đơn)
export async function emailOrder(ref: { id: string } | { code: string }, siteUrl: string) {
  const o = await prisma.order
    .findUnique({ where: ref, select: { code: true, quantity: true, totalAmount: true, user: { select: { email: true, username: true } }, product: { select: { name: true } } } })
    .catch(() => null);
  if (!o) return;
  const name = o.product.name as Record<string, string> | null;
  await sendTemplate('order', o.user.email, {
    username: o.user.username ?? o.user.email,
    code: o.code,
    product: name?.vi ?? name?.en ?? Object.values(name ?? {})[0] ?? '',
    amount: String(o.quantity),
    pay: `$${Number(o.totalAmount.toString()).toLocaleString('en-US', { maximumFractionDigits: 4 })}`,
    link: `${siteUrl.replace(/\/+$/, '')}/dashboard/orders/${encodeURIComponent(o.code)}`,
  });
}

export async function emailLoginAlert(user: { email: string; username: string | null }, ip: string, device: string) {
  await sendTemplate('loginAlert', user.email, { username: user.username ?? user.email, ip, device: device.slice(0, 200) });
}

// ---------------------------------------------------------------- Hủy nhận tin (link trong email chiến dịch)
function unsubSecret() {
  const s = process.env.JWT_REFRESH_SECRET ?? process.env.ENCRYPTION_KEY;
  if (!s) throw new Error('Thiếu JWT_REFRESH_SECRET để ký link hủy nhận tin');
  return s;
}

export function unsubscribeToken(userId: string) {
  return createHmac('sha256', unsubSecret()).update(`unsub:${userId}`).digest('base64url').slice(0, 32);
}

export function verifyUnsubscribeToken(userId: string, token: string) {
  const a = Buffer.from(unsubscribeToken(userId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
