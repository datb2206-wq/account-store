// Adapter mặc định cho API của "web gốc".
// Mỗi nhà cung cấp có API khác nhau -> nếu API thật khác định dạng dưới đây, viết adapter mới
// cùng interface SupplierAdapter (chỉ cần trả về SupplierCatalog) và khai báo trong suppliers/adapters.ts.
//
// Định dạng mong đợi (đặt hàng):
//   POST {baseUrl}/orders      Header: Authorization, Idempotency-Key: <reference>
//        body { "productId": "123", "quantity": 2, "reference": "<orderId của mình>" }
//   GET  {baseUrl}/orders/{id}
//   2xx  { "orderId": "S-991", "status": "completed" | "pending" | "processing" | "failed",
//          "accounts": ["user:pass", ...],  "error": "lý do nếu failed" }
//   4xx  (trừ 408/429) = web gốc TỪ CHỐI đơn (hết hàng, sai sản phẩm...) -> hoàn tiền
//   5xx / 408 / 429 / lỗi mạng = tạm thời -> thử lại
//
// Định dạng mong đợi (catalog):
//   GET {baseUrl}/products     Header: Authorization: Bearer <apiKey>
//   200 { "products": [ { "id": "123", "name": "Twitter 2015", "price": 0.25, "stock": 1500,
//                         "category": { "id": "7", "name": "Twitter" },        // không bắt buộc
//                         "minQty": 1, "maxQty": 500, "description": "login:pass" } ] }  // không bắt buộc
import { z } from 'zod';

export interface SupplierCatalogItem {
  externalId: string;
  name: string;
  description: string | null;
  cost: string; // giá vốn USD, dạng chuỗi thập phân
  stock: number;
  minQty: number;
  maxQty: number;
  // parent: danh mục cha, nếu web gốc có 2 cấp danh mục
  category: { externalId: string; name: string; parent?: { externalId: string; name: string } | null } | null;
}

export interface SupplierCatalog {
  products: SupplierCatalogItem[];
}

export type SupplierOrderResult =
  | { status: 'completed'; externalOrderId: string; items: string[] }
  | { status: 'pending'; externalOrderId: string }
  | { status: 'failed'; externalOrderId: string | null; reason: string };

// Lỗi tạm thời (mạng, timeout, 5xx, 429): KHÔNG kết luận đơn thất bại -> thử lại sau
export class SupplierTransientError extends Error {}

interface Credentials {
  baseUrl: string;
  apiKey: string;
}

export interface SupplierAdapter {
  fetchCatalog(opts: Credentials): Promise<SupplierCatalog>;
  // reference = orderId của mình: web gốc nên dùng làm idempotency key để retry không tạo 2 đơn
  placeOrder(opts: Credentials & { externalProductId: string; quantity: number; reference: string }): Promise<SupplierOrderResult>;
  getOrder(opts: Credentials & { externalOrderId: string }): Promise<SupplierOrderResult>;
}

const decimalString = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'number' ? v.toFixed(8) : v.trim()))
  .pipe(z.string().regex(/^\d+(\.\d+)?$/, 'invalid price'));

const responseSchema = z.object({
  products: z.array(
    z.object({
      id: z.union([z.string(), z.number()]).transform(String),
      name: z.string().trim().min(1).max(200),
      description: z.string().max(5000).nullish(),
      price: decimalString,
      stock: z.coerce.number().int().min(0),
      minQty: z.coerce.number().int().min(1).optional(),
      maxQty: z.coerce.number().int().min(1).optional(),
      category: z
        .object({ id: z.union([z.string(), z.number()]).transform(String), name: z.string().trim().min(1).max(100) })
        .nullish(),
    }),
  ),
});

const orderResponseSchema = z.object({
  orderId: z.union([z.string(), z.number()]).transform(String).nullish(),
  status: z.string(),
  accounts: z.array(z.string()).nullish(),
  error: z.string().nullish(),
});

async function orderRequest(url: string, apiKey: string, init: { method: 'GET' } | { method: 'POST'; body: unknown; reference: string }) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        ...(init.method === 'POST' && { 'Content-Type': 'application/json', 'Idempotency-Key': init.reference }),
      },
      body: init.method === 'POST' ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch (err) {
    throw new SupplierTransientError(`Không kết nối được web gốc: ${err}`);
  }
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  if (res.status >= 500 || res.status === 408 || res.status === 429 || res.status === 404) {
    throw new SupplierTransientError(`Web gốc HTTP ${res.status}`);
  }
  if (!res.ok) {
    return { status: 'failed', externalOrderId: null, reason: typeof body?.error === 'string' ? body.error : `HTTP ${res.status}` } as const;
  }
  const parsed = orderResponseSchema.safeParse(body);
  // 2xx nhưng sai định dạng: không chắc đơn đã tạo hay chưa -> coi là tạm thời, để admin kiểm tra
  if (!parsed.success) throw new SupplierTransientError('Web gốc trả về sai định dạng đơn hàng');
  return mapOrder(parsed.data);
}

function mapOrder(o: z.infer<typeof orderResponseSchema>): SupplierOrderResult {
  const id = o.orderId ?? null;
  const status = o.status.toLowerCase();
  if (status === 'failed' || status === 'cancelled' || status === 'canceled' || status === 'error') {
    return { status: 'failed', externalOrderId: id, reason: o.error ?? status };
  }
  if (!id) throw new SupplierTransientError('Web gốc không trả về mã đơn');
  if (status === 'completed' || status === 'success' || status === 'done') {
    return { status: 'completed', externalOrderId: id, items: (o.accounts ?? []).map((a) => a.trim()).filter(Boolean) };
  }
  return { status: 'pending', externalOrderId: id };
}

export const genericAdapter: SupplierAdapter = {
  placeOrder({ baseUrl, apiKey, externalProductId, quantity, reference }) {
    return orderRequest(`${baseUrl.replace(/\/+$/, '')}/orders`, apiKey, {
      method: 'POST',
      body: { productId: externalProductId, quantity, reference },
      reference,
    });
  },

  getOrder({ baseUrl, apiKey, externalOrderId }) {
    return orderRequest(`${baseUrl.replace(/\/+$/, '')}/orders/${encodeURIComponent(externalOrderId)}`, apiKey, { method: 'GET' });
  },

  async fetchCatalog({ baseUrl, apiKey }) {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/products`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Supplier API HTTP ${res.status}`);
    const parsed = responseSchema.safeParse(await res.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new Error(`Supplier API trả về sai định dạng: ${first?.path.join('.')} ${first?.message}`);
    }
    return {
      products: parsed.data.products.map((p) => ({
        externalId: p.id,
        name: p.name,
        description: p.description ?? null,
        cost: p.price,
        stock: p.stock,
        minQty: p.minQty ?? 1,
        maxQty: Math.max(p.maxQty ?? 1000, p.minQty ?? 1),
        category: p.category ? { externalId: p.category.id, name: p.category.name } : null,
      })),
    };
  },
};
