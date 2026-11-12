import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { toggleSchema } from '@/lib/marketing-schemas';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = adminRoute<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { isActive } = await parseBody(req, toggleSchema);
  return NextResponse.json({ category: await prisma.blogCategory.update({ where: { id }, data: { isActive } }) });
});

// Bài viết trong chuyên mục vẫn được giữ (categoryId -> NULL)
export const DELETE = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const category = await prisma.blogCategory.delete({ where: { id } });
  await writeAudit({ actorId: user.id, action: 'blog.category.delete', entity: 'BlogCategory', entityId: id, before: category, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});
