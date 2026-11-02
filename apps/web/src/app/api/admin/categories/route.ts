import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, badRequest, parseBody } from '@/lib/admin-route';
import { categorySchema } from '@/lib/admin-schemas';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

export const POST = adminRoute(async (req, _ctx, user) => {
  const data = await parseBody(req, categorySchema);
  if (data.parentId && !(await prisma.category.findUnique({ where: { id: data.parentId }, select: { id: true } }))) {
    throw badRequest('Danh mục cha không tồn tại', { parentId: ['Danh mục cha không tồn tại'] });
  }

  const category = await prisma.category.create({ data });
  await writeAudit({
    actorId: user.id,
    action: 'category.create',
    entity: 'Category',
    entityId: category.id,
    after: category,
    ip: getClientIp(req),
  });
  return NextResponse.json({ category }, { status: 201 });
});
