// Adapter cho API của acckit (tài liệu công khai: https://b2b.acckit.com/api-docs).
// Base URL khi thêm nhà cung cấp: chỉ cần tên miền, VD https://b2b.acckit.com/ (tự thêm /api/v1)
//
//   GET  /balance?api_key=                 -> { status: true, balance }                         (VND)
//   GET  /categories?api_key=              -> { data: [ { id, name, list_product: [
//                                               { id_product, name, desc, price, quantity } ] } ] } (price: VND)
//   POST /buy   form: api_key, id_product, quantity
//        -> { status: true, msg, trans_id, data: ["uid|pass|...", ...] }
//   GET  /order?api_key=&order_id=         -> { id, status: "success", data: [...] }
//   Lỗi: HTTP 200 với { status: false, msg }  (sai key: "Invalid api_key")
//
// Giống via79: giá & số dư bằng VND (quy đổi USD theo tỷ giá) và KHÔNG có mã chống mua trùng,
// nên chỉ thử lại lệnh mua khi chắc chắn lệnh chưa tới web gốc.
import { z } from 'zod';
import { supplierFetch } from './context';
import { SupplierTransientError, type SupplierAdapter, type SupplierCatalogItem, type SupplierOrderResult } from './generic-adapter';
import { accountsOf, vndToUsd } from './via79-adapter';

const MAX_QTY = 1000;
const NOT_SENT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT']);
const HEADERS = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; ShopSync/1.0)' };

// Admin có thể nhập tên miền, link trang tài liệu (/api-docs) hoặc đủ /api/v1
const base = (url: string) => {
  const u = url.trim().replace(/\/+$/, '');
  try {
    const x = new URL(u);
    return /\/api\/v\d+$/.test(x.pathname) ? u : `${x.origin}/api/v1`;
  } catch {
    return u;
  }
};

const num = z.union([z.number(), z.string()]).transform((v) => String(v).trim()).pipe(z.string().regex(/^\d+(\.\d+)?$/));
const id = z.union([z.string(), z.number()]).transform(String);

const catalogSchema = z.object({
  data: z.array(
    z.object({
      id,
      name: z.string().trim().min(1),
      list_product: z
        .array(
          z.object({
            id_product: id,
            name: z.string().trim().min(1),
            desc: z.string().nullish(),
            price: num,
            quantity: z.coerce.number().int().min(0).catch(0),
          }),
        )
        .nullish(),
    }),
  ),
});

const replySchema = z
  .object({
    status: z.union([z.boolean(), z.string()]).nullish(),
    msg: z.string().nullish(),
    trans_id: id.nullish(),
    id: id.nullish(),
    data: z.unknown().optional(),
  })
  .passthrough();
type Reply = z.infer<typeof replySchema>;

const ok = (b: Reply | null) => b?.status === true || b?.status === 'success';
const isAuthError = (msg: string | null | undefined) => /api[_ ]?key|login|đăng nhập|token/i.test(msg ?? '');
const errorText = (res: Response, b: Reply | null) => `${b?.msg ?? 'Error'} (HTTP ${res.status})`;
const key = (k: string) => encodeURIComponent(k);

async function getJson(url: string) {
  let res: Response;
  try {
    res = await supplierFetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000), cache: 'no-store' });
  } catch (err) {
    throw new SupplierTransientError(`Không kết nối được acckit: ${err}`);
  }
  const json = await res.json().catch(() => null);
  const body = replySchema.safeParse(json);
  return { res, json, body: body.success ? body.data : null };
}

export const acckitAdapter: SupplierAdapter = {
  async fetchCatalog({ baseUrl, apiKey }) {
    const toUsd = await vndToUsd();
    const { res, json, body } = await getJson(`${base(baseUrl)}/categories?api_key=${key(apiKey)}`);
    if (!res.ok) throw new Error(`acckit API HTTP ${res.status}: ${body?.msg ?? ''}`);
    const parsed = catalogSchema.safeParse(json);
    if (!parsed.success) {
      if (body?.msg) throw new Error(`acckit: ${body.msg}`);
      const first = parsed.error.issues[0];
      throw new Error(`acckit API trả về sai định dạng: ${first?.path.join('.')} ${first?.message}`);
    }
    const products: SupplierCatalogItem[] = [];
    for (const c of parsed.data.data) {
      for (const p of c.list_product ?? []) {
        products.push({
          externalId: p.id_product,
          name: p.name.slice(0, 200),
          description: p.desc ? p.desc.replace(/\r\n?/g, '\n').trim().slice(0, 5000) || null : null,
          cost: toUsd(p.price),
          stock: p.quantity,
          minQty: 1,
          maxQty: MAX_QTY,
          category: { externalId: c.id, name: c.name, parent: null },
        });
      }
    }
    return { products };
  },

  async getBalance({ baseUrl, apiKey }) {
    const { res, body } = await getJson(`${base(baseUrl)}/balance?api_key=${key(apiKey)}`);
    const bal = num.safeParse((body as Record<string, unknown> | null)?.balance);
    if (!res.ok || !ok(body) || !bal.success) throw new SupplierTransientError(`acckit: ${errorText(res, body)}`);
    return (await vndToUsd())(bal.data);
  },

  async placeOrder({ baseUrl, apiKey, externalProductId, quantity }): Promise<SupplierOrderResult> {
    const form = new FormData();
    form.set('api_key', apiKey);
    form.set('id_product', externalProductId);
    form.set('quantity', String(quantity));

    let res: Response;
    try {
      res = await supplierFetch(`${base(baseUrl)}/buy`, { method: 'POST', headers: HEADERS, body: form, signal: AbortSignal.timeout(120_000), cache: 'no-store' });
    } catch (err) {
      const code = (err as { cause?: { code?: string } })?.cause?.code;
      if (code && NOT_SENT_CODES.has(code)) throw new SupplierTransientError(`Không kết nối được acckit (${code})`);
      return { status: 'failed', externalOrderId: null, reason: `acckit không phản hồi lệnh mua (${code ?? String(err)}). Kiểm tra lịch sử đơn bên acckit.` };
    }
    const parsed = replySchema.safeParse(await res.json().catch(() => null));
    const body = parsed.success ? parsed.data : null;

    // Sai key / giới hạn tần suất: lệnh bị chặn từ đầu -> thử lại an toàn
    if (res.status === 401 || res.status === 403 || res.status === 429 || (body?.status === false && isAuthError(body.msg))) {
      throw new SupplierTransientError(`acckit ${errorText(res, body)}`);
    }
    if (ok(body)) {
      const oid = body!.trans_id ?? body!.id ?? null;
      const items = accountsOf(body!.data);
      if (items && items.length > 0) return { status: 'completed', externalOrderId: oid ?? 'acckit', items };
      if (oid) return { status: 'pending', externalOrderId: oid };
    }
    if (body?.status === false && res.status < 500) {
      return { status: 'failed', externalOrderId: null, reason: `Rejected by acckit: ${errorText(res, body)}` };
    }
    return { status: 'failed', externalOrderId: body?.trans_id ?? null, reason: `acckit trả về phản hồi lạ: ${errorText(res, body)}. Kiểm tra lịch sử đơn bên acckit.` };
  },

  async getOrder({ baseUrl, apiKey, externalOrderId }): Promise<SupplierOrderResult> {
    const { res, body } = await getJson(`${base(baseUrl)}/order?api_key=${key(apiKey)}&order_id=${encodeURIComponent(externalOrderId)}`);
    if (res.status === 404) return { status: 'failed', externalOrderId, reason: `acckit: ${errorText(res, body)}` };
    const items = accountsOf(body?.data);
    if (res.ok && ok(body) && items && items.length > 0) return { status: 'completed', externalOrderId, items };
    if (res.ok && typeof body?.status === 'string' && /fail|cancel|refund|hủy|hoàn/i.test(body.status)) {
      return { status: 'failed', externalOrderId, reason: `acckit: đơn ${body.status}` };
    }
    if (!res.ok || body?.status === false) throw new SupplierTransientError(`acckit ${errorText(res, body)}`);
    return { status: 'pending', externalOrderId };
  },
};
