import Link from 'next/link';
import { preload } from 'react-dom';
import { LogoImage } from './logo-image';

// File tĩnh trong apps/web/public. Thay file này (giữ tên) là đổi logo mặc định.
export const DEFAULT_LOGO = '/logo.svg';

// Logo mặc định = <img> trỏ tới file tĩnh, render hoàn toàn ở server, không state, không JS phía client:
//  - width/height ghi thẳng trên thẻ -> chiếm đúng 36x36 ngay cả khi CSS chưa tải xong (không nhảy layout)
//  - màu + hình nằm trong file SVG -> không phụ thuộc Tailwind, không có lúc "hình trắng trên nền trắng"
//  - preload() đưa <link rel="preload"> vào <head> -> trình duyệt tải logo song song với HTML
function DefaultLogo({ name, compact }: { name: string; compact: boolean }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={DEFAULT_LOGO} alt="" width={36} height={36} fetchPriority="high" decoding="sync" className="block size-9 shrink-0" />
      {/* compact: header điện thoại (< 640px) chỉ hiện biểu tượng để đủ chỗ cho các nút bên phải */}
      <span className={`text-[17px] leading-none font-extrabold tracking-tight whitespace-nowrap text-zinc-900 ${compact ? 'hidden sm:inline' : ''}`}>{name}</span>
    </>
  );
}

// logoUrl (Admin > Cấu hình > site.general): file khác trong public (VD "/my-logo.png") hoặc URL https.
// Ảnh đó tải lỗi -> tự quay về logo mặc định ở trên.
export function Logo({ name, logoUrl, compact = false }: { name: string; logoUrl?: string; compact?: boolean }) {
  const custom = logoUrl && logoUrl !== DEFAULT_LOGO ? logoUrl : null;
  preload(custom ?? DEFAULT_LOGO, { as: 'image', fetchPriority: 'high' });

  return (
    <Link href="/" aria-label={name} className="flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500">
      {custom ? (
        <LogoImage src={custom} alt={name} fallback={<DefaultLogo name={name} compact={compact} />} />
      ) : (
        <DefaultLogo name={name} compact={compact} />
      )}
    </Link>
  );
}
