// Chọn adapter theo Supplier.adapter (Admin > Nhà cung cấp).
import { Prisma } from '@accszone/database';
import { decrypt } from '../crypto';
import { acckitAdapter } from './acckit-adapter';
import { accszoneAdapter } from './accszone-adapter';
import { buyaccfbAdapter } from './buyaccfb-adapter';
import { runtimeOf, runWithSupplier } from './context';
import { genericAdapter, type SupplierAdapter, type SupplierCatalog } from './generic-adapter';
import { via79Adapter } from './via79-adapter';

export function getAdapter(kind: string): SupplierAdapter {
  if (kind === 'accszone') return accszoneAdapter;
  if (kind === 'via79') return via79Adapter;
  if (kind === 'buyaccfb') return buyaccfbAdapter;
  if (kind === 'acckit') return acckitAdapter;
  return genericAdapter;
}

// Nguồn tính giá VND: adapter tự quy đổi (và tự dùng tỷ giá riêng nếu có)
const VND_ADAPTERS = new Set(['via79', 'buyaccfb', 'acckit']);

export interface SupplierConnection {
  adapter: string;
  baseUrl: string;
  apiKeyEnc: string;
  priceRate?: Prisma.Decimal | string | null;
  proxyEnc?: string | null;
}

// Adapter đã gắn key + proxy + tỷ giá riêng của 1 kết nối. Mọi chỗ gọi web nguồn nên đi qua đây.
export function supplierClient(s: SupplierConnection) {
  const adapter = getAdapter(s.adapter);
  const rt = runtimeOf(s);
  const creds = { baseUrl: s.baseUrl, apiKey: decrypt(s.apiKeyEnc) };
  // Nguồn tính bằng USD (hoặc tiền khác) + có tỷ giá riêng: nhân giá & số dư với tỷ giá
  const scale = rt.priceRate && !VND_ADAPTERS.has(s.adapter) ? rt.priceRate : null;
  const toUsd = (v: string) => (scale ? new Prisma.Decimal(v).mul(scale).toDecimalPlaces(8, Prisma.Decimal.ROUND_UP).toFixed(8) : v);
  const run = <T>(fn: () => Promise<T>) => runWithSupplier(rt, fn);

  return {
    fetchCatalog: () =>
      run(async (): Promise<SupplierCatalog> => {
        const catalog = await adapter.fetchCatalog(creds);
        return scale ? { products: catalog.products.map((p) => ({ ...p, cost: toUsd(p.cost) })) } : catalog;
      }),
    placeOrder: (o: { externalProductId: string; quantity: number; reference: string }) => run(() => adapter.placeOrder({ ...creds, ...o })),
    getOrder: (o: { externalOrderId: string }) => run(() => adapter.getOrder({ ...creds, ...o })),
    getBalance: adapter.getBalance ? () => run(async () => toUsd(await adapter.getBalance!(creds))) : undefined,
  };
}
