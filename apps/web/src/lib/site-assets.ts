// Ảnh giao diện (Admin > Giao diện): logo, favicon, banner... lưu trong bảng site_assets.
// Trang web chỉ đọc "phiên bản" (updatedAt) của từng ảnh để dựng URL /api/assets/<key>?v=<phiên bản>:
// URL đổi mỗi lần admin tải ảnh mới, nên trình duyệt được phép cache ảnh rất lâu.
import { connection } from 'next/server';
import { cache } from 'react';
import { prisma } from '@accszone/database';

export const ASSET_SLOTS = {
  logo: { label: 'Logo (nền sáng)', hint: 'Hiện ở đầu trang web và trang đăng nhập. Nên dùng PNG/WebP nền trong suốt, cao khoảng 64px.', maxKb: 512 },
  logoDark: { label: 'Logo (nền tối)', hint: 'Hiện trên thanh menu tối của trang admin. Để trống = dùng chữ cái đầu + tên website.', maxKb: 512 },
  favicon: { label: 'Favicon', hint: 'Biểu tượng nhỏ trên tab trình duyệt. Ảnh vuông PNG hoặc ICO, 64×64 hoặc 128×128.', maxKb: 128 },
  ogImage: { label: 'Ảnh chia sẻ', hint: 'Ảnh hiện khi gửi link website qua Facebook, Telegram, Zalo... Kích thước đẹp nhất 1200×630.', maxKb: 1024 },
  banner: { label: 'Banner trang chủ', hint: 'Ảnh ngang hiện trên cùng trang chủ (khi khách không tìm kiếm). Nên rộng ~1600px, cao 300–400px.', maxKb: 1536 },
  productDefault: { label: 'Ảnh sản phẩm mặc định', hint: 'Dùng cho sản phẩm thuộc danh mục chưa có icon và không nhận diện được thương hiệu.', maxKb: 256 },
  avatar: { label: 'Avatar mặc định', hint: 'Ảnh đại diện cho tài khoản (góc trên trang admin và trang tài khoản).', maxKb: 256 },
} as const;

export type AssetKey = keyof typeof ASSET_SLOTS;
export const isAssetKey = (k: string): k is AssetKey => k in ASSET_SLOTS;

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  ico: 'image/x-icon',
} as const;

// Nhận diện bằng "magic bytes", không tin tên file / Content-Type trình duyệt gửi.
// Không nhận SVG: SVG có thể chứa script, mở trực tiếp URL ảnh sẽ chạy script trên tên miền của shop.
export function sniffImage(buf: Buffer): string | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return MIME.png;
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return MIME.jpg;
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return MIME.webp;
  if (buf.length > 6 && (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a')) return MIME.gif;
  if (buf.length > 4 && buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return MIME.ico;
  return null;
}

// key -> URL ảnh (chỉ có những ảnh admin đã tải lên). cache(): 1 query / request.
export const getSiteAssets = cache(async (): Promise<Partial<Record<AssetKey, string>>> => {
  await connection();
  try {
    const rows = await prisma.siteAsset.findMany({ select: { key: true, updatedAt: true } });
    const out: Partial<Record<AssetKey, string>> = {};
    for (const r of rows) if (isAssetKey(r.key)) out[r.key] = `/api/assets/${r.key}?v=${r.updatedAt.getTime().toString(36)}`;
    return out;
  } catch {
    return {}; // DB lỗi / chưa migrate: dùng giao diện mặc định, không làm hỏng trang
  }
});
