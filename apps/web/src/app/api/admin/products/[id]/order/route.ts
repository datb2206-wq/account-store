import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@accszone/database';
import { adminRoute, notFound, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  sortOrder: z.number().int().min(-100_000).max(100_000).optional(),
  isFeatured: z.boolean().optional(),
  // Lên đầu / xuống cuối danh mục của sản phẩm
  move: z.enum(['top', 'bottom']).optional(),
});

// Sửa nhanh thứ tự / ghim nổi bật ngay trong danh sách sản phẩm Admin
export const PATCH = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const input = await parseBody(req, schema);
  const p = await prisma.product.findUnique({ where: { id }, select: { categoryId: true, sortOrder: true, isFeatured: true } });
  if (!p) throw notFound('Sản phẩm không tồn tại');

  let sortOrder = input.sortOrder;
  if (input.move) {
    const agg = await prisma.product.aggregate({ where: { categoryId: p.categoryId, id: { not: id } }, _min: { sortOrder: true }, _max: { sortOrder: true } });
    sortOrder = input.move === 'top' ? Math.max(-100_000, (agg._min.sortOrder ?? 0) - 1) : Math.min(100_000, (agg._max.sortOrder ?? 0) + 1);
  }
  const updated = await prisma.product.update({
    where: { id },
    data: { ...(sortOrder !== undefined && { sortOrder }), ...(input.isFeatured !== undefined && { isFeatured: input.isFeatured }) },
    select: { sortOrder: true, isFeatured: true },
  });
  await writeAudit({ actorId: user.id, action: 'product.order', entity: 'Product', entityId: id, before: { sortOrder: p.sortOrder, isFeatured: p.isFeatured }, after: updated, ip: getClientIp(req) });
  return NextResponse.json(updated);
});
