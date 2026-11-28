// Hàm chung cho 2 bot Telegram (bot khách hàng + bot admin). Chỉ chạy phía server.
// Telegram gọi webhook https://<web>/api/webhooks/telegram/<shop|admin>, kèm header X-Telegram-Bot-Api-Secret-Token
// = HMAC(token bot) -> request giả mạo (không biết ENCRYPTION_KEY) bị từ chối.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getConfig, getTelegramSettings, type ConfigValue } from '@accszone/core';
import { getRedis } from './redis';

export type ShopBotSettings = ConfigValue<'telegram.shop'>;
export const SHOP_BOT_DEFAULTS: ShopBotSettings = { enabled: false, botToken: '', botUsername: '', supportUrl: '' };

export async function getShopBotSettings(): Promise<ShopBotSettings> {
  try {
    return await getConfig('telegram.shop');
  } catch {
    return SHOP_BOT_DEFAULTS;
  }
}

// ---------------------------------------------------------------- API
export interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
}
export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  photo?: { file_id: string; file_size?: number }[];
  document?: { file_id: string; mime_type?: string; file_size?: number };
  reply_to_message?: TgMessage;
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; from: TgUser; message?: TgMessage; data?: string };
}
export type Button = { text: string; callback_data: string } | { text: string; url: string };
export type Keyboard = Button[][];

export class TelegramApiError extends Error {}

export async function tg<T = unknown>(token: string, method: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!data?.ok) throw new TelegramApiError(data?.description ?? `Telegram HTTP ${res.status}`);
  return data.result as T;
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function sendText(token: string, chatId: number | string, text: string, keyboard?: Keyboard) {
  return tg(token, 'sendMessage', {
    chat_id: chatId,
    text: text.slice(0, 4000),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(keyboard && { reply_markup: { inline_keyboard: keyboard } }),
  });
}

// Sửa tin cũ (bấm nút trong menu) thay vì gửi tin mới cho gọn; tin quá cũ không sửa được -> gửi mới
export async function editOrSend(token: string, chatId: number, messageId: number | undefined, text: string, keyboard?: Keyboard) {
  if (messageId) {
    try {
      return await tg(token, 'editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: text.slice(0, 4000),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: keyboard ?? [] },
      });
    } catch (err) {
      if (err instanceof TelegramApiError && /not modified/i.test(err.message)) return;
    }
  }
  return sendText(token, chatId, text, keyboard);
}

export async function sendDocument(token: string, chatId: number, filename: string, content: string, caption?: string, keyboard?: Keyboard) {
  const form = new FormData();
  form.set('chat_id', String(chatId));
  if (caption) {
    form.set('caption', caption.slice(0, 1000));
    form.set('parse_mode', 'HTML');
  }
  if (keyboard) form.set('reply_markup', JSON.stringify({ inline_keyboard: keyboard }));
  form.set('document', new Blob([content], { type: 'text/plain' }), filename);
  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendDocument`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!data?.ok) throw new TelegramApiError(data?.description ?? `Telegram HTTP ${res.status}`);
}

// Gửi ảnh (VD mã QR PIX, ảnh lỗi bảo hành) kèm chú thích + nút; replyTo = trả lời 1 tin có sẵn
export async function sendPhoto(token: string, chatId: number | string, png: Uint8Array, caption: string, keyboard?: Keyboard, replyTo?: number) {
  const form = new FormData();
  form.set('chat_id', String(chatId));
  if (replyTo) form.set('reply_parameters', JSON.stringify({ message_id: replyTo, allow_sending_without_reply: true }));
  form.set('caption', caption.slice(0, 1000));
  form.set('parse_mode', 'HTML');
  if (keyboard) form.set('reply_markup', JSON.stringify({ inline_keyboard: keyboard }));
  form.set('photo', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'qr.png');
  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendPhoto`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!data?.ok) throw new TelegramApiError(data?.description ?? `Telegram HTTP ${res.status}`);
}

// Tải file khách gửi cho bot (ảnh chụp lỗi...). File của bot nào chỉ bot đó tải được -> tải về rồi bot admin gửi lại
const MAX_FILE = 10 * 1024 * 1024;
export async function downloadFile(token: string, fileId: string): Promise<Uint8Array | null> {
  try {
    const f = await tg<{ file_path?: string; file_size?: number }>(token, 'getFile', { file_id: fileId });
    if (!f.file_path || (f.file_size ?? 0) > MAX_FILE) return null;
    const res = await fetch(`https://api.telegram.org/file/bot${encodeURIComponent(token)}/${f.file_path}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.length <= MAX_FILE ? buf : null;
  } catch {
    return null;
  }
}

export const deleteMessage = (token: string, chatId: number, messageId: number) => tg(token, 'deleteMessage', { chat_id: chatId, message_id: messageId }).catch(() => {});

// ---------------------------------------------------------------- Nhật ký webhook (Admin > Telegram): 200 dòng gần nhất trong Redis
const LOG_KEY = (bot: string) => `tg:log:${bot}`;
export interface BotLogEntry {
  at: string;
  from: string;
  kind: 'msg' | 'btn';
  data: string;
  ms: number;
  error?: string;
}
export async function writeBotLog(bot: string, entry: BotLogEntry) {
  try {
    const r = getRedis();
    await r.lpush(LOG_KEY(bot), JSON.stringify(entry));
    await r.ltrim(LOG_KEY(bot), 0, 199);
  } catch {}
}
export async function readBotLog(bot: string): Promise<BotLogEntry[]> {
  try {
    return (await getRedis().lrange(LOG_KEY(bot), 0, 199)).map((s) => JSON.parse(s) as BotLogEntry);
  } catch {
    return [];
  }
}

export const answerCallback =(token: string, id: string, text?: string) =>
  tg(token, 'answerCallbackQuery', { callback_query_id: id, ...(text && { text: text.slice(0, 190), show_alert: text.length > 60 }) }).catch(() => {});

// ---------------------------------------------------------------- Webhook
export function webhookSecret(botToken: string) {
  return createHmac('sha256', process.env.ENCRYPTION_KEY ?? '').update(`tg-webhook:${botToken}`).digest('hex').slice(0, 48);
}

export function validWebhookSecret(botToken: string, header: string | null) {
  if (!botToken || !header) return false;
  const a = Buffer.from(webhookSecret(botToken));
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function setWebhook(botToken: string, url: string) {
  await tg(botToken, 'setWebhook', { url, secret_token: webhookSecret(botToken), allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
}

export const deleteWebhook = (botToken: string) => tg(botToken, 'deleteWebhook', {}).catch(() => {});

export const getMe = (botToken: string) => tg<{ id: number; username: string; first_name: string }>(botToken, 'getMe');

// Telegram gửi lại update nếu web trả lời chậm -> mỗi update chỉ xử lý 1 lần
export async function firstDelivery(bot: string, updateId: number) {
  try {
    return (await getRedis().set(`tg:upd:${bot}:${updateId}`, '1', 'EX', 3600, 'NX')) === 'OK';
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------- Liên kết tài khoản
// Trang web tạo mã 1 lần (10 phút) -> link t.me/<bot>?start=<mã> -> bot gắn Telegram ID vào tài khoản
const LINK_TTL = 600;

export async function createLinkCode(userId: string) {
  const code = randomBytes(18).toString('base64url');
  await getRedis().set(`tg:link:${code}`, userId, 'EX', LINK_TTL);
  return code;
}

export async function consumeLinkCode(code: string) {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(code)) return null;
  return getRedis().getdel(`tg:link:${code}`);
}

// Trạng thái hội thoại (VD đang chờ khách nhập số lượng)
export async function setChatState(bot: string, chatId: number, value: string | null) {
  const key = `tg:state:${bot}:${chatId}`;
  if (value === null) await getRedis().del(key);
  else await getRedis().set(key, value, 'EX', 600);
}
export const getChatState = (bot: string, chatId: number) => getRedis().get(`tg:state:${bot}:${chatId}`);

// Yêu cầu bảo hành gửi vào nhóm admin: tin nhắn trong nhóm -> khách nào (để admin Reply là chuyển cho khách)
export const warrantyKey = (adminChatId: string | number, messageId: number) => `tg:wr:${adminChatId}:${messageId}`;

export const displayName = (u: TgUser) => (u.username ? `@${u.username}` : [u.first_name, u.last_name].filter(Boolean).join(' ')).slice(0, 100);

export { getTelegramSettings };
