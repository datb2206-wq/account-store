import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { blogCategorySchema } from '@/lib/marketing-schemas';

export const POST = adminRoute(async (req, _ctx, user) => {
  const data = await parseBody(req, blogCategorySchema);
  const category = await prisma.blogCategory.create({ data });
  await writeAudit({ actorId: user.id, action: 'blog.category.create', entity: 'BlogCategory', entityId: category.id, after: category, ip: getClientIp(req) });
  return NextResponse.json({ category }, { status: 201 });
});
