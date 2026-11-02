import type { Locale } from '@/i18n/config';

// Cờ SVG vẽ tay: emoji cờ (🇬🇧…) không hiển thị trên Windows mà chỉ ra 2 chữ cái.
// Không dùng id/clipPath -> nhiều lá cờ trên cùng trang không bị trùng id.
function star(cx: number, cy: number, r: number, rotate = 0) {
  return Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : r * 0.382;
    const angle = ((i * 36 - 90 + rotate) * Math.PI) / 180;
    return `${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`;
  }).join(' ');
}

const FLAGS: Record<Locale, React.ReactNode> = {
  // Union Jack (rút gọn) — viewBox 60x30
  en: (
    <svg preserveAspectRatio="xMidYMid slice" viewBox="0 0 60 30">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="2" />
      <path d="M30,0 V30 M0,15 H60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  ),
  id: (
    <svg preserveAspectRatio="xMidYMid slice" viewBox="0 0 3 2">
      <rect width="3" height="1" fill="#CE1126" />
      <rect y="1" width="3" height="1" fill="#fff" />
    </svg>
  ),
  ru: (
    <svg preserveAspectRatio="xMidYMid slice" viewBox="0 0 9 6">
      <rect width="9" height="2" fill="#fff" />
      <rect y="2" width="9" height="2" fill="#0039A6" />
      <rect y="4" width="9" height="2" fill="#D52B1E" />
    </svg>
  ),
  zh: (
    <svg preserveAspectRatio="xMidYMid slice" viewBox="0 0 30 20">
      <rect width="30" height="20" fill="#DE2910" />
      <polygon points={star(5, 5, 3)} fill="#FFDE00" />
      <polygon points={star(10, 2, 1, 23)} fill="#FFDE00" />
      <polygon points={star(12, 4, 1, 45)} fill="#FFDE00" />
      <polygon points={star(12, 7, 1, 70)} fill="#FFDE00" />
      <polygon points={star(10, 9, 1, 20)} fill="#FFDE00" />
    </svg>
  ),
};

export function Flag({ locale, className = '' }: { locale: Locale; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex h-3.5 w-5 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-zinc-900/10 [&>svg]:h-full [&>svg]:w-full ${className}`}
    >
      {FLAGS[locale]}
    </span>
  );
}
