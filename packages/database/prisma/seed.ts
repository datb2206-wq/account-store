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

const accounts = (brand: string): I18nName => ({ en: `${brand} Accounts`, id: `Akun ${brand}`, ru: `Аккаунты ${brand}`, zh: `${brand} 账号` });

// Danh mục cho mega menu, xếp theo thứ tự hiển thị (trái -> phải, trên -> dưới).
// Danh mục con chỉ gồm các mục đã có trong yêu cầu; nhóm còn lại admin tự thêm ở Admin > Danh mục.
const DEFAULT_CATEGORIES: Array<{ slug: string; name: I18nName; children?: string[] }> = [
  { slug: 'facebook-accounts', name: accounts('Facebook'), children: ['USA Facebook', 'Facebook With Friends', 'Facebook With Page', 'Old Facebook Ads Accounts', 'Selfie Verified'] },
  { slug: 'instagram-accounts', name: accounts('Instagram') },
  { slug: 'threads', name: { en: 'Threads' } },
  { slug: 'gmail-accounts', name: accounts('Gmail') },
  { slug: 'mobile-proxies', name: { en: 'Mobile Proxies', id: 'Proksi Seluler', ru: 'Мобильные прокси', zh: '移动代理' } },
  { slug: 'youtube-accounts-channels', name: { en: 'Youtube Accounts & Channels', id: 'Akun & Kanal Youtube', ru: 'Аккаунты и каналы Youtube', zh: 'Youtube 账号和频道' } },
  { slug: 'google-voice', name: { en: 'Google Voice' } },
  { slug: 'odnoklassniki', name: { en: 'Odnoklassniki (OK.RU)' } },
  { slug: 'whatsapp-accounts', name: accounts('WhatsApp') },
  { slug: 'telegram-accounts', name: accounts('Telegram') },
  { slug: 'linkedin-accounts', name: accounts('Linkedin') },
  { slug: 'indeed-accounts', name: accounts('Indeed') },
  { slug: 'tiktok', name: { en: 'TikTok' } },
  { slug: 'twitter-x', name: { en: 'Twitter/X' } },
  { slug: 'buy-ai-accounts', name: { en: 'Buy AI Accounts', id: 'Beli Akun AI', ru: 'Купить AI-аккаунты', zh: '购买 AI 账号' } },
  { slug: 'truth-social', name: { en: 'Truth Social' } },
  { slug: 'google-ads-accounts', name: accounts('Google Ads') },
  { slug: 'bluesky', name: { en: 'Bluesky' } },
  { slug: 'reddit', name: { en: 'Reddit' } },
  { slug: 'discord', name: { en: 'Discord' } },
  { slug: 'twitch', name: { en: 'Twitch' } },
  { slug: 'trustpilot', name: { en: 'Trustpilot' } },
  { slug: 'yelp', name: { en: 'Yelp' } },
  { slug: 'quora', name: { en: 'Quora' } },
  { slug: 'dating-app', name: { en: 'Dating App', id: 'Aplikasi Kencan', ru: 'Приложения для знакомств', zh: '交友应用' } },
  { slug: 'snapchat', name: { en: 'Snapchat' } },
  { slug: 'grindr', name: { en: 'Grindr' } },
  { slug: 'gaming-accounts', name: { en: 'Gaming Accounts', id: 'Akun Game', ru: 'Игровые аккаунты', zh: '游戏账号' } },
  {
    slug: 'premium-subscriptions',
    name: { en: 'Premium Subscriptions', id: 'Langganan Premium', ru: 'Премиум-подписки', zh: '高级订阅' },
    children: ['Canva Pro', 'Gemini Pro', 'Adobe Express', 'Duolingo', 'Office 365'],
  },
  {
    slug: 'gift-cards-subscriptions',
    name: { en: 'Gift Cards & Subscriptions', id: 'Kartu Hadiah & Langganan', ru: 'Подарочные карты и подписки', zh: '礼品卡和订阅' },
    children: ['Apple ID', 'Google Play', 'Amazon', 'Playstation', 'Steam', 'IPTV', 'VPN', 'Netflix', 'Spotify', 'E-commerce', 'Walmart', 'Etsy', 'Craigslist'],
  },
  {
    slug: 'email-leads-tools',
    name: { en: 'Email Leads & Tools', id: 'Email Leads & Alat', ru: 'Email-базы и инструменты', zh: '邮件线索和工具' },
    children: ['Pinterest', 'Windows Keys', 'CapCut Pro', 'VPS/RDP', 'Yahoo', 'Outlook', 'ProtonMail', 'Mail.ru', 'Yandex', 'Rambler', 'GitHub', 'Roblox', 'Uber'],
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
async function seedCategories() {
  let order = 0;
  for (const category of DEFAULT_CATEGORIES) {
    order += 10;
    const data = { name: category.name, description: {}, sortOrder: order };
    const parent = await prisma.category.upsert({ where: { slug: category.slug }, update: {}, create: { slug: category.slug, ...data } });
    for (const [i, name] of (category.children ?? []).entries()) {
      const slug = toSlug(name);
      await prisma.category.upsert({
        where: { slug },
        update: {},
        create: { slug, name: { en: name }, description: {}, sortOrder: i, parentId: parent.id },
      });
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
