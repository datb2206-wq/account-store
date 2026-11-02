import { brandFor, brandForeground } from '@/lib/brand-icons';
import { classifyCategory, type CategoryGlyph } from '@/lib/category-groups';
import {
  CameraIcon, ChatIcon, GamepadIcon, GiftIcon, GlobeIcon, GridIcon, HashIcon, KeyIcon,
  MailIcon, MusicIcon, PlayIcon, SendIcon, ShieldIcon, SparklesIcon, UsersIcon,
} from '../icons';

// Icon danh mục, theo thứ tự ưu tiên:
//   1. iconUrl admin đặt (Admin > Danh mục)
//   2. logo thương hiệu, nhận diện từ tên/slug
//   3. biểu tượng chung theo loại (toàn cầu cho proxy, hộp quà cho gift card…)
//   4. huy hiệu chữ cái với màu cố định theo slug
const GLYPHS: Record<CategoryGlyph, (p: { size?: number }) => React.ReactNode> = {
  users: UsersIcon, camera: CameraIcon, hash: HashIcon, music: MusicIcon, play: PlayIcon,
  mail: MailIcon, send: SendIcon, chat: ChatIcon, gift: GiftIcon, globe: GlobeIcon,
  shield: ShieldIcon, sparkles: SparklesIcon, gamepad: GamepadIcon, key: KeyIcon, grid: GridIcon,
};

const PALETTE = [
  'bg-blue-500', 'bg-sky-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500',
  'bg-violet-500', 'bg-teal-500', 'bg-pink-500', 'bg-orange-500', 'bg-cyan-600',
];

function colorFor(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : name.slice(0, 2)).toUpperCase();
}

const SIZES = {
  sm: { box: 'size-6 text-[10px] rounded-md', glyph: 13 },
  md: { box: 'size-8 text-xs rounded-lg', glyph: 16 },
  lg: { box: 'size-11 text-sm rounded-xl', glyph: 22 },
} as const;

export function GlyphBadge({ glyph, color, size = 'md' }: { glyph: CategoryGlyph; color: string; size?: keyof typeof SIZES }) {
  const Glyph = GLYPHS[glyph];
  return (
    <span className={`${SIZES[size].box} ${color} inline-flex shrink-0 items-center justify-center text-white shadow-sm`} aria-hidden>
      <Glyph size={SIZES[size].glyph} />
    </span>
  );
}

export function CategoryIcon({ name, slug, iconUrl, size = 'md' }: { name: string; slug: string; iconUrl?: string | null; size?: keyof typeof SIZES }) {
  const { box, glyph: glyphSize } = SIZES[size];
  if (iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={iconUrl} alt="" className={`${box} shrink-0 object-contain`} loading="lazy" />;
  }
  const brand = brandFor(slug, name);
  if (brand) {
    const foreground = brandForeground(brand.hex);
    return (
      <span className={`${box} inline-flex shrink-0 items-center justify-center font-bold shadow-sm`} style={{ backgroundColor: brand.hex, color: foreground }} aria-hidden>
        {brand.path ? (
          <svg viewBox="0 0 24 24" width={glyphSize} height={glyphSize} fill="currentColor"><path d={brand.path} /></svg>
        ) : (
          brand.text
        )}
      </span>
    );
  }
  const { glyph, color } = classifyCategory(slug, name);
  if (glyph) return <GlyphBadge glyph={glyph} color={color ?? colorFor(slug)!} size={size} />;
  return (
    <span className={`${box} ${color ?? colorFor(slug)} inline-flex shrink-0 items-center justify-center font-bold text-white`} aria-hidden>
      {initials(name)}
    </span>
  );
}
