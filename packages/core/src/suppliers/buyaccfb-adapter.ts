// Adapter cho API của buyaccfb.com (tài liệu công khai: documenter.getpostman.com/view/14060489/2s935oLj7P).
// Base URL khi thêm nhà cung cấp: https://graph.buyaccfb.com/api
//
// Mọi lệnh đều là POST {baseUrl}, header Authorization: <token>, body JSON { act, data? }:
//   { act: "Me" }                                   -> { error_code: 0, user: { balance } }            (VND)
//   { act: "Get-Products" }                         -> { error_code: 0, products: [ { id, name, category_id, price,
//                                                         quantity, description, detailed_description (base64 HTML) } ] }
//   { act: "Create-Order", data: { service_id, quantity } } -> { error_code: 0, message, order_id }
//   { act: "Get-Order", data: { order_id } }       -> { error_code: 0, data: { status, data: "acc1\nacc2\n" } }
//   Lỗi: HTTP 200 với { error_code: != 0, message }  (sai token: "Please login!" / "Vui lòng đăng nhập!")
//
// Giống via79: giá & số dư bằng VND (quy đổi USD theo tỷ giá Admin > Tiền tệ) và KHÔNG có mã chống mua trùng,
// nên chỉ thử lại lệnh mua khi chắc chắn lệnh chưa tới web gốc. API không trả tên danh mục (chỉ category_id)
// -> sản phẩm được gom vào 1 danh mục mang tên nhà cung cấp, admin tự chuyển danh mục nếu muốn.
import { z } from 'zod';
import { supplierFetch } from './context';
import { SupplierTransientError, type SupplierAdapter, type SupplierCatalogItem, type SupplierOrderResult } from './generic-adapter';
import { vndToUsd } from './via79-adapter';

const MAX_QTY = 1000;
const NOT_SENT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT']);
const base = (url: string) => url.replace(/\/+$/, '');

const num = z.union([z.number(), z.string()]).transform((v) => String(v).trim()).pipe(z.string().regex(/^\d+(\.\d+)?$/));
const replySchema = z.object({ error_code: z.coerce.number(), message: z.string().nullish() }).passthrough();

const productSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().trim().min(1),
  price: num,
  quantity: z.coerce.number().int().min(0).catch(0),
  description: z.string().nullish(),
  detailed_description: z.string().nullish(),
});

// Sai token: lệnh bị chặn từ đầu (chưa mua) -> lỗi tạm thời, thử lại an toàn sau khi admin sửa key
const isAuthError = (msg: string | null | undefined) => /login|đăng nhập|token/i.test(msg ?? '');

function decodeDetail(b64: string | null | undefined) {
  if (!b64) return '';
  try {
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

async function call(baseUrl: string, apiKey: string, body: object, timeoutMs = 60_000) {
  let res: Response;
  try {
    res = await supplierFetch(base(baseUrl), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: apiKey, 'User-Agent': 'Mozilla/5.0 (compatible; ShopSync/1.0)' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
  } catch (err) {
    throw new SupplierTransientError(`Không kết nối được buyaccfb: ${err}`);
  }
  const json = (await res.json().catch(() => null)) as unknown;
  const head = replySchema.safeParse(json);
  return { res, json, head: head.success ? head.data : null };
}

const errorText = (res: Response, head: { message?: string | null } | null) => `${head?.message ?? 'Error'} (HTTP ${res.status})`;

// Tài khoản giao trong data.data: chuỗi nhiều dòng (hoặc mảng chuỗi)
function accountsOf(v: unknown): string[] {
  const lines = typeof v === 'string' ? v.split(/\r?\n/) : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return lines.map((a) => a.trim()).filter(Boolean);
}

export const buyaccfbAdapter: SupplierAdapter = {
  async fetchCatalog({ baseUrl, apiKey }) {
    const toUsd = await vndToUsd();
    const { res, json, head } = await call(baseUrl, apiKey, { act: 'Get-Products' });
    if (!res.ok || !head || head.error_code !== 0) throw new Error(`buyaccfb: ${errorText(res, head)}`);
    const parsed = z.object({ products: z.array(z.unknown()) }).safeParse(json);
    if (!parsed.success) throw new Error('buyaccfb API trả về sai định dạng: thiếu products');

    const products: SupplierCatalogItem[] = [];
    for (const raw of parsed.data.products) {
      const p = productSchema.safeParse(raw);
      if (!p.success) continue; // bỏ qua dòng lỗi, không làm hỏng cả lần đồng bộ
      const { id, name, price, quantity, description, detailed_description } = p.data;
      const detail = decodeDetail(detailed_description);
      // Mô tả chi tiết thường lặp lại đúng mô tả ngắn (bọc trong <p>) -> bỏ phần trùng
      const plain = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      const short = description?.trim() ?? '';
      const desc = (detail.trim() && plain(detail) !== plain(short) ? [short, detail.trim()] : [short]).filter(Boolean).join('\n\n');
      products.push({
        externalId: id,
        name: name.slice(0, 200),
        description: desc ? desc.slice(0, 5000) : null,
        cost: toUsd(price),
        stock: quantity,
        minQty: 1,
        maxQty: MAX_QTY,
        category: null,
      });
    }
    return { products };
  },

  async getBalance({ baseUrl, apiKey }) {
    const { res, json, head } = await call(baseUrl, apiKey, { act: 'Me' });
    const bal = z.object({ user: z.object({ balance: num }) }).safeParse(json);
    if (!res.ok || head?.error_code !== 0 || !bal.success) throw new SupplierTransientError(`buyaccfb: ${errorText(res, head)}`);
    return (await vndToUsd())(bal.data.user.balance);
  },

  async placeOrder({ baseUrl, apiKey, externalProductId, quantity }): Promise<SupplierOrderResult> {
    let res: Response;
    try {
      res = await supplierFetch(base(baseUrl), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: apiKey, 'User-Agent': 'Mozilla/5.0 (compatible; ShopSync/1.0)' },
        body: JSON.stringify({ act: 'Create-Order', data: { service_id: Number(externalProductId), quantity } }),
        signal: AbortSignal.timeout(120_000),
        cache: 'no-store',
      });
    } catch (err) {
      const code = (err as { cause?: { code?: string } })?.cause?.code;
      if (code && NOT_SENT_CODES.has(code)) throw new SupplierTransientError(`Không kết nối được buyaccfb (${code})`);
      // Có thể buyaccfb đã nhận lệnh -> không thử lại để tránh mua trùng
      return { status: 'failed', externalOrderId: null, reason: `buyaccfb không phản hồi lệnh mua (${code ?? String(err)}). Kiểm tra lịch sử đơn bên buyaccfb.` };
    }
    const json = (await res.json().catch(() => null)) as { error_code?: unknown; message?: string; order_id?: unknown } | null;
    const code = json ? Number(json.error_code) : NaN;
    const orderId = json?.order_id != null ? String(json.order_id) : null;

    if (res.status === 429 || (code !== 0 && isAuthError(json?.message))) {
      throw new SupplierTransientError(`buyaccfb ${json?.message ?? 'Error'} (HTTP ${res.status})`);
    }
    if (res.ok && code === 0 && orderId) {
      // Lấy tài khoản ngay; chưa có thì worker theo dõi tiếp qua getOrder
      try {
        const r = await buyaccfbAdapter.getOrder({ baseUrl, apiKey, externalOrderId: orderId });
        if (r.status === 'completed') return r;
      } catch {}
      return { status: 'pending', externalOrderId: orderId };
    }
    if (res.ok && Number.isFinite(code) && code !== 0) {
      return { status: 'failed', externalOrderId: null, reason: `Rejected by buyaccfb: ${json?.message ?? 'Error'}` };
    }
    return { status: 'failed', externalOrderId: orderId, reason: `buyaccfb trả về phản hồi lạ (HTTP ${res.status}). Kiểm tra lịch sử đơn bên buyaccfb.` };
  },

  async getOrder({ baseUrl, apiKey, externalOrderId }): Promise<SupplierOrderResult> {
    const { res, json, head } = await call(baseUrl, apiKey, { act: 'Get-Order', data: { order_id: Number(externalOrderId) } });
    if (!res.ok || !head) throw new SupplierTransientError(`buyaccfb ${errorText(res, head)}`);
    if (head.error_code !== 0) {
      if (isAuthError(head.message)) throw new SupplierTransientError(`buyaccfb ${errorText(res, head)}`);
      return { status: 'failed', externalOrderId, reason: `buyaccfb: ${errorText(res, head)}` };
    }
    const items = accountsOf((json as { data?: { data?: unknown } }).data?.data);
    if (items.length > 0) return { status: 'completed', externalOrderId, items };
    return { status: 'pending', externalOrderId };
  },
};
