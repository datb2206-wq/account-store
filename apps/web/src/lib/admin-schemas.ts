import { z } from 'zod';

export const LOCALES = ['en', 'id', 'ru', 'zh'] as const;
export type LocaleCode = (typeof LOCALES)[number];

const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v);

// Trường đa ngôn ngữ: tiếng Anh là ngôn ngữ fallback. Bỏ các ngôn ngữ để trống trước khi lưu.
function i18n(max: number, required: boolean) {
  const opt = z.string().trim().max(max, `Tối đa ${max} ký tự`).optional();
  return z
    .object({
      en: required ? z.string().trim().min(1, 'Bắt buộc nhập tiếng Anh (EN)').max(max) : opt,
      id: opt,
      ru: opt,
      zh: opt,
    })
    .transform((obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v)) as Record<string, string>);
}

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Bắt buộc')
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Chỉ gồm a-z, 0-9 và dấu gạch ngang');

// Tiền nhận dạng chuỗi -> đưa thẳng vào Prisma.Decimal, không đi qua Number (tránh sai số float)
const money = z.preprocess(
  (v) => (typeof v === 'number' ? String(v) : v),
  z.string().trim().regex(/^\d{1,12}(\.\d{1,6})?$/, 'Số tiền không hợp lệ (tối đa 6 chữ số thập phân)'),
);

const int = (min: number, max: number) =>
  z.coerce.number().int('Phải là số nguyên').min(min, `Tối thiểu ${min}`).max(max, `Tối đa ${max}`);

const id = z.string().min(1).max(50);

export const categorySchema = z.object({
  slug,
  name: i18n(100, true),
  description: i18n(1000, false).default({}),
  iconUrl: z.preprocess(emptyToNull, z.string().trim().url('URL không hợp lệ').max(500).nullable()),
  parentId: z.preprocess(emptyToNull, id.nullable()),
  sortOrder: int(-100_000, 100_000).default(0),
  isActive: z.boolean().default(true),
});

export const productSchema = z
  .object({
    slug,
    categoryId: z.string().min(1, 'Chọn danh mục').max(50),
    name: i18n(200, true),
    description: i18n(5000, false).default({}),
    price: money.refine((v) => Number(v) > 0, 'Giá bán phải lớn hơn 0'),
    costPrice: z.preprocess(emptyToNull, money.nullable()),
    minQty: int(1, 100_000),
    maxQty: int(1, 100_000),
    sortOrder: int(-100_000, 100_000).default(0),
    isActive: z.boolean().default(true),
  })
  .refine((d) => d.minQty <= d.maxQty, { path: ['maxQty'], message: 'Phải ≥ số lượng tối thiểu' });

const optionalText = (max: number) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().trim().max(max).optional());

export const approveDepositSchema = z.object({
  amount: z.preprocess((v) => (v === '' || v === null ? undefined : v), money.refine((v) => Number(v) > 0, 'Số tiền phải > 0').optional()),
  bankRef: optionalText(100),
  txHash: optionalText(100),
  note: optionalText(500),
});

export const rejectDepositSchema = z.object({
  note: z.string().trim().min(1, 'Nhập lý do từ chối').max(500),
});

export const adjustBalanceSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email không hợp lệ'),
  amount: z
    .string()
    .trim()
    .regex(/^-?\d{1,12}(\.\d{1,6})?$/, 'Số tiền không hợp lệ (VD: 10 hoặc -5.5)')
    .refine((v) => Number(v) !== 0, 'Số tiền phải khác 0'),
  note: z.string().trim().min(3, 'Nhập lý do (tối thiểu 3 ký tự)').max(500),
});

export const refundOrderSchema = z.object({
  // Bỏ trống = hoàn toàn bộ phần còn lại
  amount: z.preprocess((v) => (v === '' || v === null ? undefined : v), money.refine((v) => Number(v) > 0, 'Số tiền phải > 0').optional()),
  reason: z.string().trim().min(3, 'Nhập lý do (tối thiểu 3 ký tự)').max(500),
});

export const deliverOrderSchema = z.object({
  accounts: z.string().max(2_000_000).refine((v) => v.split(/\r?\n/).some((l) => l.trim()), 'Dán ít nhất 1 tài khoản (mỗi dòng 1 tài khoản)'),
});

export const replaceItemsSchema = z.object({
  itemIds: z.array(z.string().min(1).max(50)).min(1, 'Chọn ít nhất 1 tài khoản').max(1000),
  reason: z.string().trim().min(3, 'Nhập lý do (tối thiểu 3 ký tự)').max(500),
});

export const userStatusSchema = z.object({ status: z.enum(['ACTIVE', 'BANNED']) });

export const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Bắt buộc').max(100),
  adapter: z.enum(['generic', 'accszone']).default('generic'),
  baseUrl: z
    .string()
    .trim()
    .url('URL không hợp lệ')
    .max(500)
    .refine((v) => /^https?:\/\//.test(v), 'Chỉ hỗ trợ http(s)'),
  apiKey: optionalText(1000), // để trống khi sửa = giữ key cũ
  priceMarkup: z
    .preprocess((v) => (typeof v === 'number' ? String(v) : v), z.string().trim().regex(/^\d{1,4}(\.\d{1,4})?$/, 'VD: 1.2 = bán bằng 1.2 lần giá vốn'))
    .refine((v) => Number(v) >= 1, 'Markup phải ≥ 1 (không bán dưới giá vốn)'),
  autoUpdatePrice: z.boolean().default(true),
  priceRounding: z.enum(['none', '0.01', '0.1', '1']).default('none'), // khớp PRICE_ROUNDINGS ở core
  autoUpdateInfo: z.boolean().default(false),
  stripHtml: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export const stockImportSchema = z.object({
  content: z.string().min(1, 'Chưa nhập dữ liệu').max(5_000_000, 'Dữ liệu quá lớn (tối đa ~5MB mỗi lần)'),
});

export const stockActionSchema = z
  .object({
    productId: id,
    action: z.enum(['invalidate', 'restore', 'delete']),
    ids: z.array(id).min(1).max(1000).optional(),
    batch: z.string().min(1).max(50).optional(),
  })
  .refine((d) => !!d.ids !== !!d.batch, 'Phải chọn danh sách ids HOẶC một lô (batch)');
