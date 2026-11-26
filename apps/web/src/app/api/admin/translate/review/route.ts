import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@accszone/database';
import { adminRoute, notFound, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

const schema = z.object({
  id: z.string().min(1).max(50),
  locale: z.enum(['en', 'id', 'ru', 'zh', 'pt']).default('pt'),
  name: z.string().trim().min(1).max(300),
  description: z.string().max(5000).optional(),
  lock: z.boolean().default(true),
});

const asMap = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {});

// Lưu tay bản dịch 1 sản phẩm từ trang Duyệt bản dịch (chỉ ghi ngôn ngữ đích, giữ nguyên tên gốc)
export const POST = adminRoute(async (req, _ctx, user) => {
  const input = await parseBody(req, schema);
  const p = await prisma.product.findUnique({ where: { id: input.id }, select: { id: true, name: true, description: true } });
  if (!p) throw notFound('Sản phẩm không tồn tại');
  const name = asMap(p.name);
  const desc = asMap(p.description);
  const { lock: _l, ...nameRest } = name;
  await prisma.product.update({
    where: { id: p.id },
    data: {
      name: { ...nameRest, [input.locale]: input.name, ...(input.lock && { lock: '1' }) },
      ...(input.description !== undefined && { description: { ...desc, [input.locale]: input.description.replace(/\r\n?/g, '\n').trim() } }),
    },
  });
  await writeAudit({
    actorId: user.id,
    action: 'translate.review',
    entity: 'Product',
    entityId: p.id,
    before: { name: name[input.locale] ?? null, description: desc[input.locale] ?? null },
    after: { name: input.name, description: input.description ?? null, lock: input.lock },
    ip: getClientIp(req),
  });
  return NextResponse.json({ ok: true });
});
