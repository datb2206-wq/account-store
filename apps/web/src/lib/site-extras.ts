import { cache } from 'react';
import { CONFIG_SCHEMAS, CONTENT_PAGES, type ConfigValue, type ContentPage } from '@accszone/core';
import { prisma } from '@accszone/database';

export type SiteExtras = ConfigValue<'site.extras'>;

export const SITE_EXTRAS_DEFAULTS: SiteExtras = {
  primaryColor: '',
  buyColor: '',
  popup: { enabled: false, title: '', body: '', buttonText: '', buttonUrl: '', frequency: 'session' },
  pages: Object.fromEntries(CONTENT_PAGES.map((p) => [p, { title: '', body: '' }])) as SiteExtras['pages'],
  tracking: { gaId: '', fbPixelId: '', bodyHtml: '' },
  widgets: { zalo: '', messenger: '', hotline: '' },
  leaderboard: { enabled: false, period: 'month', size: 10 },
};

// Tiêu đề mặc định khi admin chưa đặt (tiếng Việt, admin tự đổi)
export const CONTENT_PAGE_LABEL: Record<ContentPage, string> = {
  policy: 'Chính sách bảo hành',
  terms: 'Điều khoản sử dụng',
  faq: 'Câu hỏi thường gặp',
  contact: 'Liên hệ',
};

// Mỗi nhóm parse riêng: 1 nhóm sai (VD sửa schema) không làm mất các nhóm còn lại
export const getSiteExtras = cache(async (): Promise<SiteExtras> => {
  try {
    const row = await prisma.systemConfig.findUnique({ where: { key: 'site.extras' } });
    const raw = (row?.value ?? {}) as Record<string, unknown>;
    const shape = CONFIG_SCHEMAS['site.extras'].shape;
    const out: Record<string, unknown> = { ...SITE_EXTRAS_DEFAULTS };
    for (const key of Object.keys(shape) as (keyof typeof shape)[]) {
      const parsed = shape[key].safeParse(raw[key]);
      if (parsed.success) out[key] = parsed.data;
    }
    return out as SiteExtras;
  } catch {
    return SITE_EXTRAS_DEFAULTS;
  }
});

// Trang nội dung có bài (footer chỉ hiện link các trang này)
export function publishedPages(extras: SiteExtras) {
  return CONTENT_PAGES.filter((slug) => extras.pages[slug].body.trim()).map((slug) => ({
    slug,
    title: extras.pages[slug].title || CONTENT_PAGE_LABEL[slug],
  }));
}

// Đổi màu chủ đạo (blue) / nút mua (orange) bằng cách ghi đè biến màu Tailwind v4 trên trang khách
function palette(name: string, hex: string) {
  const mix = (pct: number, to: string) => `color-mix(in oklab, ${hex} ${pct}%, ${to})`;
  const shades: [number, string][] = [
    [50, mix(8, 'white')],
    [100, mix(16, 'white')],
    [200, mix(30, 'white')],
    [300, mix(50, 'white')],
    [400, mix(75, 'white')],
    [500, mix(88, 'white')],
    [600, hex],
    [700, mix(82, 'black')],
    [800, mix(66, 'black')],
    [900, mix(50, 'black')],
  ];
  return shades.map(([n, v]) => `--color-${name}-${n}:${v};`).join('');
}

export function themeCss(extras: SiteExtras) {
  const vars = (extras.primaryColor ? palette('blue', extras.primaryColor) : '') + (extras.buyColor ? palette('orange', extras.buyColor) : '');
  return vars ? `:root{${vars}}` : '';
}
