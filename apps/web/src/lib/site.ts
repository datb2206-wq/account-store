import { headers } from 'next/headers';
import { connection } from 'next/server';
import { cache } from 'react';
import { prisma } from '@accszone/database';
import { CONFIG_SCHEMAS, getConfig } from '@accszone/core';
import { STAFF_ROLES, type CurrentUser } from './auth';

const DEFAULTS = { name: 'Account Store', logoUrl: '', supportTelegram: '', supportEmail: '', supportHours: '24/7',
  businessContact: '', supplierContact: '', channelUrl: '', resellerApiUrl: '', maintenance: false };

// Thông tin chung của website (Admin > Cấu hình > site.general). cache(): 1 query / request.
export const getSiteConfig = cache(async () => {
  // Luôn đọc lúc request: nếu không, `next build` sẽ prerender trang tĩnh (VD /login)
  // với tên mặc định và đổi cấu hình trong Admin không có tác dụng.
  await connection();
  try {
    return await getConfig('site.general');
  } catch {
    // 1 trường sai (VD logoUrl không hợp lệ) không được làm mất cả tên/logo website:
    // giữ lại từng trường còn hợp lệ, trường lỗi dùng giá trị mặc định.
    try {
      const row = await prisma.systemConfig.findUnique({ where: { key: 'site.general' } });
      const raw = (row?.value ?? {}) as Record<string, unknown>;
      const shape = CONFIG_SCHEMAS['site.general'].shape;
      const out: Record<string, unknown> = { ...DEFAULTS };
      for (const key of Object.keys(shape) as (keyof typeof shape)[]) {
        const parsed = shape[key].safeParse(raw[key]);
        if (parsed.success) out[key] = parsed.data;
      }
      return out as typeof DEFAULTS;
    } catch {
      return DEFAULTS; // DB không kết nối được
    }
  }
});

export const MAINTENANCE_ERROR = 'The site is under maintenance.';

// Bảo trì (site.general.maintenance): khách bị chặn, nhân viên vẫn dùng được để kiểm tra
export async function blockedByMaintenance(user: CurrentUser | null) {
  if (user && STAFF_ROLES.includes(user.role)) return false;
  return (await getSiteConfig()).maintenance;
}

// URL gốc theo tên miền đang truy cập (canonical, sitemap). Nginx đặt sẵn X-Forwarded-Proto.
export async function getSiteUrl() {
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host') ?? 'localhost'}`;
}
