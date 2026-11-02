// Phân loại danh mục theo tên/slug để chọn icon + màu mặc định khi không có logo thương hiệu
// (lib/brand-icons.ts) và admin chưa đặt iconUrl. Dùng được cả server lẫn client.

export type CategoryGlyph =
  | 'users' | 'camera' | 'hash' | 'music' | 'play' | 'mail' | 'send' | 'chat'
  | 'gift' | 'globe' | 'shield' | 'sparkles' | 'gamepad' | 'key' | 'grid';

const GROUP_KEYS = ['social', 'email', 'messaging', 'ai', 'streaming', 'gaming', 'gift', 'proxies', 'software', 'other'] as const;
export type CategoryGroup = (typeof GROUP_KEYS)[number];

interface GroupDef {
  glyph: CategoryGlyph;
  color: string;
  keywords: string[];
}

const GROUPS: Record<Exclude<CategoryGroup, 'other'>, GroupDef> = {
  social: {
    glyph: 'users',
    color: 'bg-blue-600',
    keywords: ['social', 'facebook', 'fb', 'instagram', 'ig', 'twitter', 'x', 'tiktok', 'threads', 'linkedin', 'reddit', 'snapchat', 'pinterest', 'tumblr', 'vk', 'quora', 'bluesky'],
  },
  email: {
    glyph: 'mail',
    color: 'bg-rose-500',
    keywords: ['email', 'mail', 'gmail', 'google', 'outlook', 'hotmail', 'yahoo', 'proton', 'protonmail', 'icloud', 'yandex', 'aol', 'gmx', 'zoho'],
  },
  messaging: {
    glyph: 'chat',
    color: 'bg-sky-500',
    keywords: ['telegram', 'tg', 'discord', 'whatsapp', 'signal', 'wechat', 'line', 'skype', 'viber', 'kakao', 'messenger'],
  },
  ai: {
    glyph: 'sparkles',
    color: 'bg-teal-600',
    keywords: ['ai', 'chatgpt', 'openai', 'gpt', 'claude', 'midjourney', 'gemini', 'copilot', 'perplexity'],
  },
  streaming: {
    glyph: 'play',
    color: 'bg-fuchsia-600',
    keywords: ['streaming', 'stream', 'netflix', 'spotify', 'youtube', 'disney', 'hbo', 'prime', 'hulu', 'twitch', 'crunchyroll', 'music', 'video', 'tv'],
  },
  gaming: {
    glyph: 'gamepad',
    color: 'bg-violet-600',
    keywords: ['game', 'games', 'gaming', 'steam', 'epic', 'xbox', 'playstation', 'psn', 'riot', 'valorant', 'roblox', 'minecraft', 'fortnite', 'pubg', 'nintendo', 'ubisoft', 'battlenet'],
  },
  gift: {
    glyph: 'gift',
    color: 'bg-amber-500',
    keywords: ['gift', 'gifts', 'giftcard', 'giftcards', 'card', 'cards', 'voucher', 'vouchers', 'itunes', 'googleplay'],
  },
  proxies: {
    glyph: 'globe',
    color: 'bg-emerald-600',
    keywords: ['proxy', 'proxies', 'vpn', 'socks', 'socks5', 'ip', 'residential', 'rdp', 'vps', 'hosting'],
  },
  software: {
    glyph: 'key',
    color: 'bg-slate-700',
    keywords: ['software', 'windows', 'office', 'adobe', 'key', 'keys', 'license', 'licence', 'antivirus', 'canva', 'microsoft', 'premium', 'subscriptions'],
  },
};

// Thứ tự ưu tiên khi tên khớp nhiều nhóm: "Steam Gift Card" -> gift, "Google Play" -> gift
const MATCH_ORDER: Exclude<CategoryGroup, 'other'>[] = ['gift', 'proxies', 'ai', 'gaming', 'streaming', 'messaging', 'email', 'social', 'software'];

// Icon/màu riêng cho từng từ khóa để các danh mục cùng nhóm vẫn phân biệt được
const OVERRIDES: Record<string, { glyph?: CategoryGlyph; color?: string }> = {
  instagram: { glyph: 'camera', color: 'bg-pink-500' },
  ig: { glyph: 'camera', color: 'bg-pink-500' },
  twitter: { glyph: 'hash', color: 'bg-zinc-900' },
  x: { glyph: 'hash', color: 'bg-zinc-900' },
  threads: { glyph: 'hash', color: 'bg-zinc-900' },
  tiktok: { glyph: 'music', color: 'bg-zinc-900' },
  reddit: { color: 'bg-orange-600' },
  linkedin: { color: 'bg-sky-700' },
  telegram: { glyph: 'send', color: 'bg-sky-500' },
  tg: { glyph: 'send', color: 'bg-sky-500' },
  discord: { color: 'bg-blue-500' },
  whatsapp: { color: 'bg-green-500' },
  gmail: { color: 'bg-red-500' },
  outlook: { color: 'bg-blue-500' },
  hotmail: { color: 'bg-blue-500' },
  yahoo: { color: 'bg-purple-600' },
  youtube: { color: 'bg-red-600' },
  netflix: { color: 'bg-red-700' },
  spotify: { glyph: 'music', color: 'bg-green-600' },
  music: { glyph: 'music' },
  vpn: { glyph: 'shield' },
  voice: { glyph: 'chat', color: 'bg-green-600' },
  premium: { glyph: 'sparkles', color: 'bg-amber-600' },
};

function tokens(text: string) {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// Từ khóa ngắn (x, ig, ai…) phải khớp nguyên từ; từ khóa >= 5 ký tự cho phép khớp tiền tố
// ("instagramaged" vẫn ra instagram) mà không bắt nhầm "mail" trong "ai".
function matches(token: string, keyword: string) {
  return token === keyword || (keyword.length >= 5 && token.startsWith(keyword));
}

export function classifyCategory(slug: string, name: string): { group: CategoryGroup; glyph: CategoryGlyph | null; color: string | null } {
  const words = [...tokens(slug), ...tokens(name)];
  const group = MATCH_ORDER.find((g) => GROUPS[g].keywords.some((k) => words.some((w) => matches(w, k)))) ?? 'other';
  const override = words.map((w) => OVERRIDES[w]).find(Boolean);
  if (group === 'other') return { group, glyph: override?.glyph ?? null, color: override?.color ?? null };
  return { group, glyph: override?.glyph ?? GROUPS[group].glyph, color: override?.color ?? GROUPS[group].color };
}
