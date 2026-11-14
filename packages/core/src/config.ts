// Đọc SystemConfig (chỉnh trên Admin > Cấu hình). Mỗi key có schema riêng để chặn cấu hình sai.
import { z } from 'zod';
import { prisma } from '@accszone/database';

const TRON_ADDRESS = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const network = (address: RegExp, label: string) =>
  z.object({
    enabled: z.boolean(),
    wallet: z.string().trim().refine((v) => v === '' || address.test(v), `Địa chỉ ví ${label} không hợp lệ`),
    contract: z.string().trim().regex(address, `Địa chỉ contract ${label} không hợp lệ`),
    minConfirmations: z.number().int().min(1).max(1000),
  });

export const CONFIG_SCHEMAS = {
  'usdt.trc20': network(TRON_ADDRESS, 'TRON'),
  'usdt.bep20': network(EVM_ADDRESS, 'BSC'),
  deposit: z.object({
    minAmountUsd: z.number().positive().max(100_000),
    expireMinutes: z.number().int().min(5).max(24 * 60),
  }),
  'bank.accounts': z
    .array(
      z.object({
        bankName: z.string().trim().min(1),
        accountNo: z.string().trim().min(1),
        accountName: z.string().trim().min(1),
        currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
      }),
    )
    .max(20),
  'currency.rates': z
    .record(z.string().regex(/^[A-Z]{3}$/), z.number().positive())
    .refine((r) => r.USD === 1, 'Tỷ giá USD phải bằng 1'),
  // Hiển thị tiền tệ cho khách (Admin > Tiền tệ). Tỷ giá vẫn nằm ở currency.rates.
  // defaultCurrency: "AUTO" = theo ngôn ngữ khách chọn; mã tiền tệ = mặc định quy đổi sang tiền đó (khách vẫn đổi được)
  'currency.display': z.object({
    defaultCurrency: z.string().trim().toUpperCase().regex(/^([A-Z]{3}|AUTO)$/, 'Mã tiền tệ gồm 3 chữ cái'),
    currencies: z
      .array(
        z.object({
          code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Mã tiền tệ gồm 3 chữ cái'),
          name: z.string().trim().min(1).max(50),
          decimals: z.number().int().min(0).max(8),
          enabled: z.boolean(),
        }),
      )
      .max(50),
  }),
  'site.general': z.object({
    name: z.string().trim().min(1),
    // Ảnh logo riêng (SVG/PNG nền trong suốt, cao ~64px): file trong apps/web/public ("/logo.svg")
    // hoặc URL http(s). Để trống = logo mặc định + tên website.
    logoUrl: z
      .string()
      .trim()
      // "/logo.svg" hợp lệ; "//evil.com/x.png" (URL không có giao thức) thì không
      .refine((v) => v === '' || /^\/(?!\/)/.test(v) || /^https?:\/\//i.test(v), 'Dùng đường dẫn bắt đầu bằng "/" (file trong public) hoặc URL http(s)')
      .default(''),
    supportTelegram: z.string().trim(), // username Telegram, không có @ (VD "myshop_support")
    supportEmail: z.string().trim().email().or(z.literal('')).default(''),
    supportHours: z.string().trim().max(100).default('24/7'),
    // Liên hệ trên thanh thông báo / nút header. Mỗi ô: username Telegram, email hoặc URL https.
    // Để trống = bấm vào sẽ mở widget hỗ trợ.
    businessContact: z.string().trim().max(200).default(''),
    supplierContact: z.string().trim().max(200).default(''),
    channelUrl: z.string().trim().max(200).default(''),
    resellerApiUrl: z.string().trim().max(200).default(''),
    maintenance: z.boolean(),
  }),
} as const;

type Schemas = typeof CONFIG_SCHEMAS;
export type ConfigKey = keyof Schemas;
export type ConfigValue<K extends ConfigKey> = z.infer<Schemas[K]>;

export const isConfigKey = (key: string): key is ConfigKey => key in CONFIG_SCHEMAS;

export async function getConfig<K extends ConfigKey>(key: K): Promise<ConfigValue<K>> {
  const row = await prisma.systemConfig.findUnique({ where: { key } });
  const parsed = CONFIG_SCHEMAS[key].safeParse(row?.value);
  if (!parsed.success) throw new Error(`SystemConfig "${key}" thiếu hoặc không hợp lệ — kiểm tra Admin > Cấu hình`);
  return parsed.data as ConfigValue<K>;
}
