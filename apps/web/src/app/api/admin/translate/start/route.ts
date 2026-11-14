import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getTranslateSettings, startTranslateJob } from '@accszone/core';
import { prisma } from '@accszone/database';
import { adminRoute, parseBody } from '@/lib/admin-route';
import { productWhere } from '@/lib/admin-products';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

const schema = z
  .object({
    ids: z.array(z.string().min(1).max(50)).min(1).max(20_000).optional(),
    filter: z.object({ q: z.string().max(200).optional(), category: z.string().max(50).optional(), status: z.string().max(20).optional() }).optional(),
    all: z.boolean().optional(), // mọi sản phẩm đang bán
    locales: z.array(z.enum(['id', 'ru', 'zh'])).max(3).optional(), // mặc định = ngôn ngữ trong cấu hình
    overwrite: z.boolean().default(false),
  })
  .refine((d) => [d.ids, d.filter, d.all].filter(Boolean).length === 1, 'Chọn sản phẩm, bộ lọc HOẶC tất cả');

// Tạo lượt dịch: worker dịch dần mỗi phút (xem tiến độ ở Admin > Dịch sản phẩm)
export const POST = adminRoute(async (req, _ctx, user) => {
  const input = await parseBody(req, schema);
  const s = await getTranslateSettings();
  const where = input.ids ? { id: { in: input.ids } } : input.filter ? productWhere(input.filter) : { isActive: true };
  const products = await prisma.product.findMany({ where, select: { id: true }, orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }], take: 20_000 });
  const job = await startTranslateJob({ productIds: products.map((p) => p.id), locales: input.locales ?? s.targets, description: s.description, overwrite: input.overwrite });
  await writeAudit({ actorId: user.id, action: 'translate.start', entity: 'SystemConfig', entityId: 'translate.job', after: { total: job.productIds.length, locales: job.locales, overwrite: job.overwrite }, ip: getClientIp(req) });
  return NextResponse.json({ total: job.productIds.length });
});
