// Cài đặt riêng của từng kết nối API, áp dụng trong lúc gọi adapter (không phải sửa chữ ký adapter):
//  - proxy: gọi web nguồn qua proxy HTTP (khi web nguồn whitelist IP mà IP máy chủ thay đổi).
//  - priceRate: tỷ giá tự đặt, 1 đơn vị tiền của API = priceRate USD. Trống = tự động
//    (nguồn VND dùng tỷ giá VND ở Admin > Cấu hình, nguồn USD giữ nguyên).
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@accszone/database';
import { decrypt } from '../crypto';

export interface SupplierRuntime {
  proxy: string | null; // URL proxy dạng http://user:pass@host:port
  priceRate: string | null;
}

const als = new AsyncLocalStorage<SupplierRuntime>();

export const supplierRuntime = () => als.getStore() ?? null;
export const runWithSupplier = <T>(rt: SupplierRuntime, fn: () => Promise<T>) => als.run(rt, fn);

// "ip:port", "ip:port:user:pass", "[ipv6]:port:user:pass", "user:pass@host:port" hoặc "http://user:pass@host:port"
export function parseProxy(raw: string): string {
  const s = raw.trim();
  if (!s) throw new Error('Proxy trống');
  if (/^https?:\/\//i.test(s)) return new URL(s).toString();
  // Dạng ip:port[:user:pass] trước (mật khẩu có thể chứa "@" hoặc ":")
  const m = /^(\[[0-9a-f:.]+\]|[^:@\s[\]]+):(\d{1,5})(?::([^:]+):(.+))?$/i.exec(s);
  if (!m) {
    if (s.includes('@')) return new URL(`http://${s}`).toString();
    throw new Error('Proxy dạng ip:port hoặc ip:port:username:password');
  }
  const [, host, port, user, pass] = m;
  if (Number(port) < 1 || Number(port) > 65535) throw new Error('Cổng proxy không hợp lệ');
  const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(pass!)}@` : '';
  return new URL(`http://${auth}${host}:${port}`).toString();
}

export function runtimeOf(s: { priceRate?: Prisma.Decimal | string | null; proxyEnc?: string | null }): SupplierRuntime {
  return {
    proxy: s.proxyEnc ? parseProxy(decrypt(s.proxyEnc)) : null,
    priceRate: s.priceRate != null && Number(s.priceRate) > 0 ? s.priceRate.toString() : null,
  };
}

type Undici = typeof import('undici');
let undici: Promise<Undici> | null = null;
const agents = new Map<string, InstanceType<Undici['ProxyAgent']>>();

// fetch dùng trong adapter: có proxy -> đi qua proxy (undici), không có -> fetch thường
export async function supplierFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const proxy = supplierRuntime()?.proxy;
  if (!proxy) return fetch(url, init);
  const u = await (undici ??= import('undici'));
  let agent = agents.get(proxy);
  if (!agent) {
    agent = new u.ProxyAgent(proxy);
    agents.set(proxy, agent);
  }
  // `cache` là tuỳ chọn riêng của Next.js; FormData phải là của undici
  const { cache: _cache, body, ...rest } = init;
  let sendBody: unknown = body;
  if (body instanceof FormData) {
    const fd = new u.FormData();
    body.forEach((v, k) => fd.append(k, v as string));
    sendBody = fd;
  }
  return (await u.fetch(url, { ...(rest as object), body: sendBody, dispatcher: agent } as Parameters<Undici['fetch']>[1])) as unknown as Response;
}
