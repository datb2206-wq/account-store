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

const HEX_COLOR = z.string().trim().regex(/^(#[0-9a-fA-F]{6})?$/, 'Màu dạng #RRGGBB');

// Trang nội dung tĩnh /pages/{slug} do admin viết (Admin > Cài đặt website)
export const CONTENT_PAGES = ['policy', 'terms', 'faq', 'contact'] as const;
export type ContentPage = (typeof CONTENT_PAGES)[number];

// Key có trang quản trị riêng (giữ bí mật, xóa cache…): trang Cấu hình chung không hiển thị / không ghi các key này
export const DEDICATED_CONFIG_KEYS = ['security', 'telegram', 'email', 'affiliate', 'currency.display', 'currency.rates', 'site.extras', 'payment.card', 'payment.manual'] as const;

// Nhà mạng thẻ cào theo chuẩn API chargingws/v2 của các web đổi thẻ
export const CARD_TELCOS = ['VIETTEL', 'VINAPHONE', 'MOBIFONE', 'VIETNAMOBILE', 'ZING', 'GATE', 'VCOIN', 'GARENA'] as const;
export type CardTelco = (typeof CARD_TELCOS)[number];

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
  // Admin > Bảo mật. Thiếu key -> web dùng SECURITY_DEFAULTS (apps/web/src/lib/security.ts)
  security: z.object({
    loginFailIpLimit: z.number().int().min(1).max(100), // sai mật khẩu N lần / 15 phút từ 1 IP -> tự chặn IP
    autoBlockHours: z.number().int().min(1).max(24 * 365),
    loginFailAccountLimit: z.number().int().min(1).max(100), // sai N lần / 15 phút vào 1 tài khoản -> tạm khóa đăng nhập tài khoản đó
    maxAccountsPerIp: z.number().int().min(0).max(10_000), // 0 = không giới hạn
    singleSessionStaff: z.boolean(), // admin/nhân viên chỉ đăng nhập 1 thiết bị
    singleSessionUser: z.boolean(), // khách chỉ đăng nhập 1 thiết bị
    captcha: z.object({
      enabled: z.boolean(),
      siteKey: z.string().trim().max(200),
      secretKey: z.string().trim().max(200),
      onLogin: z.boolean(),
      onRegister: z.boolean(),
    }),
  }),
  // Affiliate (Admin > Affiliate Program): hoa hồng giới thiệu
  affiliate: z.object({
    enabled: z.boolean(),
    percent: z.number().min(0).max(50), // % hoa hồng trên số tiền đơn hàng thực trả của người được giới thiệu
    minWithdraw: z.number().min(0).max(100_000), // USD
    allowBalance: z.boolean(), // cho rút vào số dư mua hàng (tức thì)
    allowBank: z.boolean(), // cho rút về ngân hàng (admin duyệt, chuyển tay)
    cookieDays: z.number().int().min(1).max(365), // link giới thiệu có hiệu lực bao nhiêu ngày
  }),
  // Email (Admin > Email): SMTP + mẫu email gửi khách. Mẫu dùng biến {username}, {code}... (xem core/email.ts)
  email: z.object({
    enabled: z.boolean(),
    host: z.string().trim().max(200),
    port: z.number().int().min(1).max(65535),
    secure: z.enum(['tls', 'ssl', 'none']), // tls = STARTTLS (587), ssl = 465
    user: z.string().trim().max(200),
    pass: z.string().max(500),
    fromEmail: z.string().trim().max(200),
    fromName: z.string().trim().max(100),
    templates: z.object({
      order: z.object({ enabled: z.boolean(), subject: z.string().max(300), body: z.string().max(20_000) }),
      loginAlert: z.object({ enabled: z.boolean(), subject: z.string().max(300), body: z.string().max(20_000) }),
    }),
  }),
  // Thông báo Telegram (Admin > Thông báo Telegram). Mẫu tin dùng biến {username}, {amount}... (xem core/telegram.ts)
  telegram: z.object({
    enabled: z.boolean(),
    botToken: z.string().trim().max(200),
    chatId: z.string().trim().max(100),
    events: z.object({ order: z.boolean(), deposit: z.boolean(), refund: z.boolean(), lowBalance: z.boolean() }),
    lowBalanceUsd: z.number().min(0).max(1_000_000), // số dư nguồn API dưới mức này -> báo
    templates: z.object({
      order: z.string().max(2000),
      deposit: z.string().max(2000),
      refund: z.string().max(2000),
      lowBalance: z.string().max(2000),
    }),
  }),
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
  // Thẻ cào: gửi thẻ sang đối tác đổi thẻ (API chargingws/v2), đối tác gọi callback báo kết quả
  'payment.card': z.object({
    enabled: z.boolean(),
    // http chỉ cho localhost (thử nghiệm với đối tác giả lập)
    apiUrl: z.string().trim().refine((v) => v === '' || /^https:\/\/[^\s/]+(\/[^\s]*)?$/i.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(v), 'URL dạng https://ten-mien.com'),
    partnerId: z.string().trim().max(100),
    partnerKey: z.string().trim().max(200), // bí mật: không gửi ra trình duyệt
    wrongValuePercent: z.number().min(0).max(100), // sai mệnh giá: khách nhận % này của mệnh giá thật
    amounts: z.array(z.number().int().min(1000).max(10_000_000)).min(1).max(20),
    telcos: z
      .array(z.object({ code: z.enum(CARD_TELCOS), fee: z.number().min(0).max(90), enabled: z.boolean() }))
      .max(CARD_TELCOS.length),
  }),
  // Nạp thủ công: MoMo và các phương thức admin tự tạo (khách chuyển rồi báo, admin duyệt)
  'payment.manual': z
    .array(
      z.object({
        id: z.string().trim().regex(/^[a-z0-9-]{2,30}$/, 'Mã chỉ gồm a-z, 0-9, dấu gạch ngang'),
        kind: z.enum(['momo', 'custom']),
        name: z.string().trim().min(1).max(60),
        accountNo: z.string().trim().min(1).max(200), // số MoMo / email PayPal / ID Binance…
        accountName: z.string().trim().max(100),
        currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3,4}$/, 'Mã tiền tệ 3–4 chữ cái'),
        instructions: z.string().max(3000),
        enabled: z.boolean(),
      }),
    )
    .max(20)
    .refine((list) => new Set(list.map((m) => m.id)).size === list.length, 'Mã phương thức bị trùng'),
  // Admin > Cài đặt website: màu, popup, trang nội dung, mã theo dõi, nút liên hệ, bảng xếp hạng
  'site.extras': z.object({
    primaryColor: HEX_COLOR,
    buyColor: HEX_COLOR,
    popup: z.object({
      enabled: z.boolean(),
      title: z.string().trim().max(200),
      body: z.string().trim().max(5000),
      buttonText: z.string().trim().max(50),
      buttonUrl: z.string().trim().max(500).refine((v) => v === '' || /^\/(?!\/)/.test(v) || /^https?:\/\//i.test(v), 'Link phải bắt đầu bằng "/" hoặc http(s)://'),
      frequency: z.enum(['session', 'day', 'always']),
    }),
    pages: z.object(
      Object.fromEntries(CONTENT_PAGES.map((slug) => [slug, z.object({ title: z.string().trim().max(120), body: z.string().max(50_000) })])) as Record<
        ContentPage,
        z.ZodObject<{ title: z.ZodString; body: z.ZodString }>
      >,
    ),
    tracking: z.object({
      gaId: z.string().trim().regex(/^(G-[A-Z0-9]{4,20})?$/i, 'Mã GA4 dạng G-XXXXXXX'),
      fbPixelId: z.string().trim().regex(/^\d{0,20}$/, 'Pixel ID chỉ gồm số'),
      bodyHtml: z.string().max(20_000),
    }),
    widgets: z.object({
      zalo: z.string().trim().regex(/^(\d{8,15})?$/, 'Số Zalo chỉ gồm 8–15 chữ số'),
      messenger: z.string().trim().regex(/^([A-Za-z0-9.]{3,80})?$/, 'Username trang Facebook (phần sau facebook.com/)'),
      hotline: z.string().trim().regex(/^(\+?\d{6,15})?$/, 'Số điện thoại 6–15 chữ số'),
    }),
    leaderboard: z.object({
      enabled: z.boolean(),
      period: z.enum(['week', 'month', 'all']),
      size: z.number().int().min(3).max(20),
    }),
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
