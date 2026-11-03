// Adapter cho API v1 của AccsZone: https://accszone.com/api-docs
// Base URL khi thêm nhà cung cấp: https://accszone.com/api/v1
//
// Khác adapter generic ở những điểm sau:
//  - Xác thực bằng header X-API-Key, mọi phản hồi bọc trong { success, data, meta }.
//  - Catalog phân trang cứng 20 dòng, nhóm endpoint catalog giới hạn 30 request/phút cho cả tài khoản.
//  - POST /purchase giao hàng ngay trong phản hồi, không có trạng thái "đang xử lý".
//  - client_reference bắt buộc là UUID, gửi lại đúng UUID thì web gốc trả lại đơn cũ, không trừ tiền lần 2.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { SupplierTransientError, type SupplierAdapter, type SupplierCatalogItem, type SupplierOrderResult } from './generic-adapter';

// 30 request/phút -> mỗi trang cách nhau hơn 2 giây để không đụng giới hạn
const PAGE_DELAY_MS = Number(process.env.ACCSZONE_PAGE_DELAY_MS ?? 2_100);
const MAX_RATE_LIMIT_RETRIES = 5;
const MAX_PAGES = 1_000;
const MASKED_ACCOUNT = /^\*+$/; // tài khoản đã hoàn/đổi hiện dạng ********

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const base = (url: string) => url.replace(/\/+$/, '');

const envelopeSchema = z.object({
  success: z.boolean().optional(),
  data: z.unknown().optional(),
  meta: z.object({ current_page: z.number(), last_page: z.number() }).partial().optional(),
  message: z.string().nullish(),
  error_code: z.string().nullish(),
});

const refSchema = z.object({ id: z.number(), title: z.string().trim().min(1) });

const listingSchema = z.object({
  id: z.number(),
  title: z.string().trim().min(1),
  description: z.string().nullish(),
  price: z.string().regex(/^\d+(\.\d+)?$/),
  available_stock: z.coerce.number().int().min(0),
  category: refSchema.nullish(),
  subcategory: refSchema.nullish(),
});

const balanceSchema = z.object({ balance: z.string().regex(/^-?\d+(\.\d+)?$/) });
const purchaseSchema = z.object({ order_id: z.number(), accounts: z.array(z.string()).nullish() });
const orderSchema = z.object({ id: z.number(), is_refund: z.boolean().nullish(), accounts: z.array(z.string()).nullish() });

// Mô tả của web gốc là HTML; shop hiển thị dạng văn bản thuần
export function htmlToText(html: string) {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// orderId của mình là cuid, web gốc đòi UUID -> suy ra UUID cố định từ orderId: retry luôn ra cùng 1 UUID
export function referenceToUuid(reference: string) {
  const h = createHash('sha256').update(`accszone:${reference}`).digest('hex');
  const variant = ((Number.parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function toCatalogItem(l: z.infer<typeof listingSchema>): SupplierCatalogItem {
  const parent = l.category ? { externalId: `c${l.category.id}`, name: l.category.title } : null;
  const category = l.subcategory ? { externalId: `s${l.subcategory.id}`, name: l.subcategory.title, parent } : parent;
  return {
    externalId: String(l.id),
    name: l.title.slice(0, 200),
    description: l.description ? htmlToText(l.description).slice(0, 5000) || null : null,
    cost: l.price,
    stock: l.available_stock,
    minQty: 1,
    maxQty: 1000,
    category,
  };
}

async function getCatalogPage(baseUrl: string, apiKey: string, page: number) {
  const url = `${base(baseUrl)}/listings?include=description&page=${page}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      await sleep(Number(res.headers.get('retry-after') ?? 60) * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`AccsZone API HTTP ${res.status}`);
    const parsed = envelopeSchema.safeParse(await res.json());
    const rows = parsed.success ? z.array(listingSchema).safeParse(parsed.data.data) : null;
    if (!parsed.success || !rows?.success) throw new Error(`AccsZone API trả về sai định dạng (trang ${page})`);
    return { rows: rows.data, lastPage: parsed.data.meta?.last_page ?? page };
  }
}

// Lỗi về đơn: quyết định giữa "thử lại" và "web gốc từ chối -> hoàn tiền".
// Theo tài liệu, 4xx và 500 đều chưa trừ tiền; thử lại vẫn an toàn nhờ client_reference.
async function orderRequest(url: string, apiKey: string, body?: unknown) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { 'X-API-Key': apiKey, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch (err) {
    throw new SupplierTransientError(`Không kết nối được AccsZone: ${err}`);
  }

  const parsed = envelopeSchema.safeParse(await res.json().catch(() => null));
  const code = parsed.success ? parsed.data.error_code : null;
  const label = `HTTP ${res.status}${code ? ` ${code}` : ''}, request ${res.headers.get('x-request-id') ?? 'n/a'}`;

  // 401/403: sai key hoặc tài khoản bị khóa, lỗi cấu hình chứ không phải đơn hỏng -> để worker thử lại
  if (res.status >= 500 || res.status === 401 || res.status === 403 || res.status === 408 || res.status === 429) {
    throw new SupplierTransientError(`AccsZone ${label}`);
  }
  if (!res.ok) return { rejected: `${parsed.success && parsed.data.message ? parsed.data.message : 'Rejected'} (${label})` };
  if (!parsed.success) throw new SupplierTransientError(`AccsZone trả về sai định dạng (${label})`);
  return { data: parsed.data.data };
}

const delivered = (accounts: string[] | null | undefined) =>
  (accounts ?? []).map((a) => a.trim()).filter((a) => a && !MASKED_ACCOUNT.test(a));

export const accszoneAdapter: SupplierAdapter = {
  async fetchCatalog({ baseUrl, apiKey }) {
    const products: SupplierCatalogItem[] = [];
    let lastPage = 1;
    // Lỗi ở bất kỳ trang nào đều ném ra: sync với catalog thiếu sẽ đặt nhầm tồn kho = 0 cho các trang chưa đọc
    for (let page = 1; page <= lastPage; page++) {
      if (page > MAX_PAGES) throw new Error(`AccsZone catalog vượt quá ${MAX_PAGES} trang`);
      if (page > 1) await sleep(PAGE_DELAY_MS);
      const result = await getCatalogPage(baseUrl, apiKey, page);
      products.push(...result.rows.map(toCatalogItem));
      lastPage = result.lastPage;
    }
    return { products };
  },

  async placeOrder({ baseUrl, apiKey, externalProductId, quantity, reference }): Promise<SupplierOrderResult> {
    const res = await orderRequest(`${base(baseUrl)}/purchase`, apiKey, {
      ad_id: Number(externalProductId),
      quantity,
      client_reference: referenceToUuid(reference),
    });
    if (res.rejected) return { status: 'failed', externalOrderId: null, reason: res.rejected };
    const order = purchaseSchema.safeParse(res.data);
    if (!order.success) throw new SupplierTransientError('AccsZone trả về đơn sai định dạng');
    return { status: 'completed', externalOrderId: String(order.data.order_id), items: delivered(order.data.accounts) };
  },

  // GET /user/balance: không bị giới hạn tần suất, đúng số dư web gốc dùng để trừ khi đặt hàng
  async getBalance({ baseUrl, apiKey }) {
    const res = await orderRequest(`${base(baseUrl)}/user/balance`, apiKey);
    if (res.rejected) throw new SupplierTransientError(res.rejected);
    const parsed = balanceSchema.safeParse(res.data);
    if (!parsed.success) throw new SupplierTransientError('AccsZone trả về số dư sai định dạng');
    return parsed.data.balance;
  },

  async getOrder({ baseUrl, apiKey, externalOrderId }): Promise<SupplierOrderResult> {
    const res = await orderRequest(`${base(baseUrl)}/orders/${encodeURIComponent(externalOrderId)}`, apiKey);
    if (res.rejected) return { status: 'failed', externalOrderId, reason: res.rejected };
    const order = orderSchema.safeParse(res.data);
    if (!order.success) throw new SupplierTransientError('AccsZone trả về đơn sai định dạng');
    if (order.data.is_refund) return { status: 'failed', externalOrderId, reason: 'Refunded by supplier' };
    return { status: 'completed', externalOrderId, items: delivered(order.data.accounts) };
  },
};
