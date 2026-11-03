import { PrismaClient, Prisma, Role, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Config mặc định. Seed dùng `update: {}` -> chạy lại seed KHÔNG ghi đè
// những gì admin đã chỉnh trên Admin Panel.
const DEFAULT_CONFIGS: Array<{
  key: string;
  value: Prisma.InputJsonValue;
  isSecret?: boolean;
  description: string;
}> = [
  {
    key: 'usdt.trc20',
    value: {
      enabled: false,
      wallet: '', // điền địa chỉ ví TRON nhận tiền trên Admin Panel
      contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT chính thức trên TRON
      minConfirmations: 20,
    },
    description: 'Cấu hình nạp USDT mạng TRC20',
  },
  {
    key: 'usdt.bep20',
    value: {
      enabled: false,
      wallet: '',
      contract: '0x55d398326f99059fF775485246999027B3197955', // USDT (BSC-USD) chính thức trên BSC
      minConfirmations: 15,
    },
    description: 'Cấu hình nạp USDT mạng BEP20',
  },
  {
    key: 'deposit',
    value: { minAmountUsd: 5, expireMinutes: 30 },
    description: 'Giới hạn và thời gian hết hạn của yêu cầu nạp',
  },
  {
    key: 'bank.accounts',
    value: [],
    description: 'Danh sách tài khoản ngân hàng nhận tiền: [{ bankName, accountNo, accountName, currency }]',
  },
  {
    key: 'currency.rates',
    // Giá trị tạm thời — sẽ được job cập nhật tỷ giá tự động ghi đè ở bước sau
    value: { USD: 1, VND: 25400, IDR: 16300, RUB: 95, CNY: 7.2 },
    description: 'Tỷ giá quy đổi từ 1 USD, dùng cho hiển thị',
  },
  {
    key: 'site.general',
    value: { name: 'Account Store', logoUrl: '', supportTelegram: '', maintenance: false },
    description: 'Thông tin chung của website',
  },
];

type I18nName = Partial<Record<'en' | 'id' | 'ru' | 'zh', string>>;

const same = (name: string): I18nName => ({ en: name, id: name, ru: name, zh: name });
const accounts = (brand: string): I18nName => ({ en: `${brand} Accounts`, id: `Akun ${brand}`, ru: `Аккаунты ${brand}`, zh: `${brand} 账号` });

// Danh mục cho mega menu, xếp theo thứ tự hiển thị (trái -> phải, trên -> dưới).
// Danh mục con chỉ gồm các mục đã có trong yêu cầu; nhóm còn lại admin tự thêm ở Admin > Danh mục.
// Danh mục con: chuỗi = tên riêng giống nhau ở mọi ngôn ngữ
const DEFAULT_CATEGORIES: Array<{ slug: string; name: I18nName; children?: (string | I18nName)[] }> = [
  { slug: 'facebook-accounts', name: accounts('Facebook'), children: [{ en: 'USA Facebook', id: 'Facebook USA', ru: 'Facebook США', zh: '美国 Facebook' }, { en: 'Facebook With Friends', id: 'Facebook dengan Teman', ru: 'Facebook с друзьями', zh: '带好友的 Facebook' }, { en: 'Facebook With Page', id: 'Facebook dengan Halaman', ru: 'Facebook со страницей', zh: '带主页的 Facebook' }, { en: 'Old Facebook Ads Accounts', id: 'Akun Iklan Facebook Lama', ru: 'Старые рекламные аккаунты Facebook', zh: 'Facebook 老广告账号' }, { en: 'Selfie Verified', id: 'Terverifikasi Selfie', ru: 'С верификацией по селфи', zh: '自拍认证' }] },
  { slug: 'instagram-accounts', name: accounts('Instagram') },
  { slug: 'threads', name: same('Threads') },
  { slug: 'gmail-accounts', name: accounts('Gmail') },
  { slug: 'mobile-proxies', name: { en: 'Mobile Proxies', id: 'Proksi Seluler', ru: 'Мобильные прокси', zh: '移动代理' } },
  { slug: 'youtube-accounts-channels', name: { en: 'Youtube Accounts & Channels', id: 'Akun & Kanal Youtube', ru: 'Аккаунты и каналы Youtube', zh: 'Youtube 账号和频道' } },
  { slug: 'google-voice', name: same('Google Voice') },
  { slug: 'odnoklassniki', name: { en: 'Odnoklassniki (OK.RU)', id: 'Odnoklassniki (OK.RU)', ru: 'Одноклассники (OK.RU)', zh: 'Odnoklassniki (OK.RU)' } },
  { slug: 'whatsapp-accounts', name: accounts('WhatsApp') },
  { slug: 'telegram-accounts', name: accounts('Telegram') },
  { slug: 'linkedin-accounts', name: accounts('Linkedin') },
  { slug: 'indeed-accounts', name: accounts('Indeed') },
  { slug: 'tiktok', name: same('TikTok') },
  { slug: 'twitter-x', name: same('Twitter/X') },
  { slug: 'buy-ai-accounts', name: { en: 'Buy AI Accounts', id: 'Beli Akun AI', ru: 'Купить AI-аккаунты', zh: '购买 AI 账号' } },
  { slug: 'truth-social', name: same('Truth Social') },
  { slug: 'google-ads-accounts', name: accounts('Google Ads') },
  { slug: 'bluesky', name: same('Bluesky') },
  { slug: 'reddit', name: same('Reddit') },
  { slug: 'discord', name: same('Discord') },
  { slug: 'twitch', name: same('Twitch') },
  { slug: 'trustpilot', name: same('Trustpilot') },
  { slug: 'yelp', name: same('Yelp') },
  { slug: 'quora', name: same('Quora') },
  { slug: 'dating-app', name: { en: 'Dating App', id: 'Aplikasi Kencan', ru: 'Приложения для знакомств', zh: '交友应用' } },
  { slug: 'snapchat', name: same('Snapchat') },
  { slug: 'grindr', name: same('Grindr') },
  { slug: 'gaming-accounts', name: { en: 'Gaming Accounts', id: 'Akun Game', ru: 'Игровые аккаунты', zh: '游戏账号' } },
  {
    slug: 'premium-subscriptions',
    name: { en: 'Premium Subscriptions', id: 'Langganan Premium', ru: 'Премиум-подписки', zh: '高级订阅' },
    children: ['Canva Pro', 'Gemini Pro', 'Adobe Express', 'Duolingo', 'Office 365'],
  },
  {
    slug: 'gift-cards-subscriptions',
    name: { en: 'Gift Cards & Subscriptions', id: 'Kartu Hadiah & Langganan', ru: 'Подарочные карты и подписки', zh: '礼品卡和订阅' },
    children: ['Apple ID', 'Google Play', 'Amazon', 'Playstation', 'Steam', 'IPTV', 'VPN', 'Netflix', 'Spotify', { en: 'E-commerce', id: 'E-commerce', ru: 'Электронная коммерция', zh: '电商' }, 'Walmart', 'Etsy', 'Craigslist'],
  },
  {
    slug: 'email-leads-tools',
    name: { en: 'Email Leads & Tools', id: 'Email Leads & Alat', ru: 'Email-базы и инструменты', zh: '邮件线索和工具' },
    children: ['Pinterest', { en: 'Windows Keys', id: 'Kunci Windows', ru: 'Ключи Windows', zh: 'Windows 密钥' }, 'CapCut Pro', 'VPS/RDP', 'Yahoo', 'Outlook', 'ProtonMail', 'Mail.ru', 'Yandex', 'Rambler', 'GitHub', 'Roblox', 'Uber'],
  },
];

const toSlug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function seedSuperAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('Thiếu SEED_ADMIN_EMAIL hoặc SEED_ADMIN_PASSWORD trong .env');
  }
  if (password.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD phải có ít nhất 12 ký tự');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Nếu user đã tồn tại: chỉ nâng quyền, KHÔNG reset mật khẩu
  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: Role.SUPER_ADMIN, status: UserStatus.ACTIVE },
    create: {
      email,
      passwordHash,
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  console.log(`✔ Super Admin: ${admin.email} (${admin.id})`);
}

async function seedSystemConfigs() {
  for (const cfg of DEFAULT_CONFIGS) {
    await prisma.systemConfig.upsert({
      where: { key: cfg.key },
      update: {},
      create: {
        key: cfg.key,
        value: cfg.value,
        isSecret: cfg.isSecret ?? false,
        description: cfg.description,
      },
    });
  }
  console.log(`✔ SystemConfig: ${DEFAULT_CONFIGS.length} keys`);
}

// `update: {}`: chạy lại seed không ghi đè tên, thứ tự, trạng thái admin đã chỉnh
// Chưa có: tạo mới. Đã có: chỉ bổ sung ngôn ngữ còn thiếu trong tên, giữ nguyên mọi chỉnh sửa của admin
// (kể cả thứ tự, danh mục cha, ẩn/hiện).
async function upsertCategory(slug: string, name: I18nName, create: { description: object; sortOrder: number; parentId?: string }) {
  const existing = await prisma.category.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!existing) return prisma.category.create({ data: { slug, name, ...create }, select: { id: true } });
  const current = (existing.name ?? {}) as I18nName;
  const merged = { ...name, ...current };
  if (Object.keys(merged).length > Object.keys(current).length) {
    await prisma.category.update({ where: { id: existing.id }, data: { name: merged } });
  }
  return existing;
}

async function seedCategories() {
  let order = 0;
  for (const category of DEFAULT_CATEGORIES) {
    order += 10;
    const parent = await upsertCategory(category.slug, category.name, { description: {}, sortOrder: order });
    for (const [i, child] of (category.children ?? []).entries()) {
      const name = typeof child === 'string' ? same(child) : child;
      await upsertCategory(toSlug(name.en!), name, { description: {}, sortOrder: i, parentId: parent.id });
    }
  }
  console.log(`✔ Danh mục: ${DEFAULT_CATEGORIES.length} nhóm`);
}

async function main() {
  await seedSuperAdmin();
  await seedSystemConfigs();
  await seedCategories();
}

main()
  .catch((err) => {
    console.error('✘ Seed thất bại:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
