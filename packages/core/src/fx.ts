// Tự cập nhật currency.rates từ API tỷ giá công khai (bật bằng FX_RATES_URL, worker chạy định kỳ).
// Hỗ trợ định dạng phổ biến { rates: { IDR: 16300, … } } với gốc USD (VD https://open.er-api.com/v6/latest/USD).
// Chỉ cập nhật các mã tiền đã có trong cấu hình; tỷ giá đổi quá MAX_JUMP một lần thì bỏ qua (dữ liệu nguồn lỗi).
import { prisma } from '@accszone/database';
import { CONFIG_SCHEMAS, getConfig } from './config';

const MAX_JUMP = 0.3;
const TIMEOUT_MS = 15_000;

export interface FxLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

export async function updateFxRates(url: string, log: FxLogger) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`FX source responded ${res.status}`);
  const body = (await res.json()) as { rates?: Record<string, unknown>; base_code?: string; base?: string };
  const base = body.base_code ?? body.base ?? 'USD';
  if (base !== 'USD' || !body.rates) throw new Error('FX source must return USD-based { rates }');

  const current = await getConfig('currency.rates');
  const next: Record<string, number> = { ...current };
  const changed: string[] = [];
  for (const [code, old] of Object.entries(current)) {
    if (code === 'USD') continue;
    const value = Number(body.rates[code]);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (Math.abs(value / old - 1) > MAX_JUMP) {
      log.warn(`skip ${code}: ${old} -> ${value} changes more than ${MAX_JUMP * 100}%, update it manually if correct`);
      continue;
    }
    const rounded = Number(value.toPrecision(8));
    if (rounded !== old) {
      next[code] = rounded;
      changed.push(`${code} ${old}->${rounded}`);
    }
  }
  if (changed.length === 0) return { changed };

  const value = CONFIG_SCHEMAS['currency.rates'].parse(next);
  await prisma.$transaction([
    prisma.systemConfig.update({ where: { key: 'currency.rates' }, data: { value } }),
    prisma.auditLog.create({ data: { action: 'config.update', entity: 'SystemConfig', entityId: 'currency.rates', before: current, after: { ...value, source: 'fx-auto' } } }),
  ]);
  log.info(`updated ${changed.join(', ')}`);
  return { changed };
}
