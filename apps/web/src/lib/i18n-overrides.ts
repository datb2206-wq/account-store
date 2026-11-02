// Bản dịch admin sửa trên web (Admin > Bản dịch), lưu ở SystemConfig "i18n.overrides":
//   { "ru": { "shop.titleLead": "…" }, … }  -> đè lên từ điển gốc trong code.
// Không cần sửa code / build lại; các instance web tự nhận bản mới sau tối đa TTL_MS.
import { z } from 'zod';
import { prisma } from '@accszone/database';
import { LOCALES, type Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/dictionaries';

export const OVERRIDES_KEY = 'i18n.overrides';
const TTL_MS = 30_000;
export const MAX_TEXT = 2000;

export type Overrides = Partial<Record<Locale, Record<string, string>>>;
const schema = z.record(z.enum(LOCALES), z.record(z.string(), z.string()));

let cached: { value: Overrides; at: number } | null = null;

export async function getOverrides(fresh = false): Promise<Overrides> {
  if (!fresh && cached && Date.now() - cached.at < TTL_MS) return cached.value;
  let value: Overrides = {};
  try {
    const row = await prisma.systemConfig.findUnique({ where: { key: OVERRIDES_KEY } });
    const parsed = schema.safeParse(row?.value ?? {});
    if (parsed.success) value = parsed.data;
  } catch {
    // DB lỗi -> dùng từ điển gốc
  }
  cached = { value, at: Date.now() };
  return value;
}

export function invalidateOverrides() {
  cached = null;
}

// "shop.products.one" -> chuỗi; chỉ lấy lá là string (Plural là object { one, other } -> 2 khóa)
export function flatten(obj: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (typeof obj === 'string') out[prefix] = obj;
  else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

export function applyOverrides(dict: Dictionary, overrides: Record<string, string> | undefined): Dictionary {
  if (!overrides || Object.keys(overrides).length === 0) return dict;
  const copy = structuredClone(dict) as unknown as Record<string, unknown>;
  for (const [path, text] of Object.entries(overrides)) {
    const parts = path.split('.');
    let node: Record<string, unknown> | undefined = copy;
    for (const p of parts.slice(0, -1)) {
      const next: unknown = node?.[p];
      node = next && typeof next === 'object' ? (next as Record<string, unknown>) : undefined;
    }
    const last = parts.at(-1)!;
    // Chỉ thay khóa đang tồn tại và đúng kiểu chuỗi (khóa cũ đã bị xóa khỏi code thì bỏ qua)
    if (node && typeof node[last] === 'string' && text.trim()) node[last] = text;
  }
  return copy as unknown as Dictionary;
}

// "{name}" placeholders: bản dịch phải giữ đủ, nếu không fmt()/rich() sẽ hiện thiếu dữ liệu
export function placeholders(text: string) {
  return [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
}
