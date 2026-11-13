// Adapter cho API của via79.com (tài liệu ở /client/document-api, cần đăng nhập).
// Base URL khi thêm nhà cung cấp: https://via79.com/api
//
//   GET  /profile.php?api_key=          -> { status, data: { username, money } }          (money: VND)
//   GET  /products.php?api_key=         -> { status, categories: [ { id, parent_id, name, products: [
//                                             { id, name, price, amount, description, min, max } ] } ] }  (price: VND)
//   GET  /order.php?api_key=&order=     -> chi tiết đơn theo trans_id
//   POST /buy_product  form-data: action=buyProduct, id, amount, api_key
//        -> { status: "success", msg, trans_id, data: ["uid|pass|...", ...] }
//   Lỗi: { status: "error", msg } (401 sai key, 400/404 ...)
//
// Khác AccsZone ở 2 điểm quan trọng:
//  - Giá và số dư tính bằng VND -> quy đổi sang USD theo currency.rates.VND (Admin > Cấu hình).
//  - Không có mã chống mua trùng (idempotency). Gửi lại lệnh mua có thể mua 2 lần, nên CHỈ ném
//    SupplierTransientError (để worker thử lại) khi chắc chắn lệnh mua chưa tới web gốc.
//    Không chắc (timeout, mất kết nối giữa chừng, 5xx, phản hồi lạ) -> trả 'failed' để hoàn tiền khách,
//    admin đối chiếu lịch sử đơn bên via79.
import { z } from 'zod';
import { Prisma } from '@accszone/database';
import { getConfig } from '../config';
import { SupplierTransientError, type SupplierAdapter, type SupplierCatalogItem, type SupplierOrderResult } from './generic-adapter';

const base = (url: string) => url.replace(/\/+$/, '');
const HEADERS = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; ShopSync/1.0)' };
const MAX_QTY = 1000;
// Lỗi xảy ra TRƯỚC khi request tới được máy chủ -> chắc chắn chưa mua
const NOT_SENT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT']);

const num = z.union([z.number(), z.string()]).transform((v) => String(v).trim()).pipe(z.string().regex(/^\d+(\.\d+)?$/));

const productSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().trim().min(1),
  price: num,
  amount: z.coerce.number().int().min(0).catch(0),
  description: z.string().nullish(),
  min: z.coerce.number().int().min(1).catch(1),
  max: z.coerce.number().int().min(1).catch(MAX_QTY),
});

const catalogSchema = z.object({
  status: z.literal('success'),
  categories: z.array(
    z.object({
      id: z.union([z.string(), z.number()]).transform(String),
      parent_id: z.union([z.string(), z.number()]).transform(String).nullish(),
      name: z.string().trim().min(1),
      products: z.array(productSchema).nullish(),
    }),
  ),
});

const replySchema = z.object({
  status: z.string(),
  msg: z.string().nullish(),
  trans_id: z.union([z.string(), z.number()]).transform(String).nullish(),
  data: z.unknown().optional(),
});

// Số VND -> USD (chuỗi thập phân 8 chữ số) theo tỷ giá đang cấu hình
async function vndToUsd() {
  const rates = await getConfig('currency.rates');
  const vnd = rates.VND;
  if (!vnd) throw new Error('Chưa có tỷ giá VND trong Admin > Cấu hình (currency.rates) — via79 tính giá bằng VND');
  return (amount: string) => new Prisma.Decimal(amount).div(vnd).toDecimalPlaces(8, Prisma.Decimal.ROUND_UP).toFixed(8);
}

const cleanText = (s: string) => s.replace(/\r\n?/g, '\n').trim();

// Danh sách tài khoản giao trong `data`: mảng chuỗi, hoặc object có 1 trường là mảng chuỗi
function accountsOf(data: unknown): string[] | null {
  const lines = (v: unknown) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null);
  const direct = lines(data);
  if (direct) return direct.map((a) => a.trim()).filter(Boolean);
  if (data && typeof data === 'object') {
    for (const v of Object.values(data)) {
      const found = lines(v);
      if (found) return found.map((a) => a.trim()).filter(Boolean);
    }
  }
  return null;
}

async function getJson(url: string) {
  let res: Response;
  try {
    res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000), cache: 'no-store' });
  } catch (err) {
    throw new SupplierTransientError(`Không kết nối được via79: ${err}`);
  }
  const body = replySchema.safeParse(await res.json().catch(() => null));
  return { res, body: body.success ? body.data : null };
}

const errorText = (res: Response, body: z.infer<typeof replySchema> | null) => `${body?.msg ?? 'Error'} (HTTP ${res.status})`;

export const via79Adapter: SupplierAdapter = {
  async fetchCatalog({ baseUrl, apiKey }) {
    const toUsd = await vndToUsd();
    const res = await fetch(`${base(baseUrl)}/products.php?api_key=${encodeURIComponent(apiKey)}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(60_000),
      cache: 'no-store',
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`via79 API HTTP ${res.status}: ${(json as { msg?: string } | null)?.msg ?? ''}`);
    const parsed = catalogSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new Error(`via79 API trả về sai định dạng: ${first?.path.join('.')} ${first?.message}`);
    }

    const byId = new Map(parsed.data.categories.map((c) => [c.id, c]));
    const products: SupplierCatalogItem[] = [];
    for (const c of parsed.data.categories) {
      const parentRow = c.parent_id && c.parent_id !== '0' ? byId.get(c.parent_id) : undefined;
      const parent = parentRow ? { externalId: parentRow.id, name: parentRow.name } : null;
      for (const p of c.products ?? []) {
        const minQty = Math.min(p.min, MAX_QTY);
        products.push({
          externalId: p.id,
          name: p.name.slice(0, 200),
          description: p.description ? cleanText(p.description).slice(0, 5000) || null : null,
          cost: toUsd(p.price),
          stock: p.amount,
          minQty,
          maxQty: Math.max(Math.min(p.max, MAX_QTY), minQty),
          category: { externalId: c.id, name: c.name, parent },
        });
      }
    }
    return { products };
  },

  async getBalance({ baseUrl, apiKey }) {
    const { res, body } = await getJson(`${base(baseUrl)}/profile.php?api_key=${encodeURIComponent(apiKey)}`);
    const money = z.object({ money: num }).safeParse(body?.data);
    if (!res.ok || body?.status !== 'success' || !money.success) throw new SupplierTransientError(`via79: ${errorText(res, body)}`);
    return (await vndToUsd())(money.data.money);
  },

  async placeOrder({ baseUrl, apiKey, externalProductId, quantity }): Promise<SupplierOrderResult> {
    const form = new FormData();
    form.set('action', 'buyProduct');
    form.set('id', externalProductId);
    form.set('amount', String(quantity));
    form.set('api_key', apiKey);

    let res: Response;
    try {
      res = await fetch(`${base(baseUrl)}/buy_product`, {
        method: 'POST',
        headers: HEADERS,
        body: form,
        signal: AbortSignal.timeout(120_000),
        cache: 'no-store',
      });
    } catch (err) {
      const code = (err as { cause?: { code?: string } })?.cause?.code;
      if (code && NOT_SENT_CODES.has(code)) throw new SupplierTransientError(`Không kết nối được via79 (${code})`);
      // Có thể via79 đã nhận lệnh -> không thử lại để tránh mua trùng
      return { status: 'failed', externalOrderId: null, reason: `via79 không phản hồi lệnh mua (${code ?? String(err)}). Kiểm tra lịch sử đơn bên via79.` };
    }

    const parsed = replySchema.safeParse(await res.json().catch(() => null));
    const body = parsed.success ? parsed.data : null;

    // Sai key hoặc bị giới hạn tần suất: lệnh mua bị chặn từ đầu -> thử lại an toàn
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      throw new SupplierTransientError(`via79 ${errorText(res, body)}`);
    }
    if (body?.status === 'success') {
      const id = body.trans_id ?? null;
      const items = accountsOf(body.data);
      if (items && items.length > 0) return { status: 'completed', externalOrderId: id ?? 'via79', items };
      // Đã mua nhưng chưa thấy tài khoản -> theo dõi đơn qua order.php
      if (id) return { status: 'pending', externalOrderId: id };
    }
    if (body?.status === 'error' && res.status < 500) {
      return { status: 'failed', externalOrderId: null, reason: `Rejected by via79: ${errorText(res, body)}` };
    }
    return { status: 'failed', externalOrderId: body?.trans_id ?? null, reason: `via79 trả về phản hồi lạ: ${errorText(res, body)}. Kiểm tra lịch sử đơn bên via79.` };
  },

  async getOrder({ baseUrl, apiKey, externalOrderId }): Promise<SupplierOrderResult> {
    const { res, body } = await getJson(`${base(baseUrl)}/order.php?api_key=${encodeURIComponent(apiKey)}&order=${encodeURIComponent(externalOrderId)}`);
    if (res.status === 404) return { status: 'failed', externalOrderId, reason: `via79: ${errorText(res, body)}` };
    if (!res.ok || body?.status !== 'success') throw new SupplierTransientError(`via79 ${errorText(res, body)}`);
    const items = accountsOf(body.data);
    if (items && items.length > 0) return { status: 'completed', externalOrderId, items };
    return { status: 'pending', externalOrderId };
  },
};
