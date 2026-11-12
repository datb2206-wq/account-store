import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { blogPostSchema } from '@/lib/marketing-schemas';

export const POST = adminRoute(async (req, _ctx, user) => {
  const data = await parseBody(req, blogPostSchema);
  const post = await prisma.blogPost.create({ data, select: { id: true, slug: true } });
  await writeAudit({ actorId: user.id, action: 'blog.post.create', entity: 'BlogPost', entityId: post.id, after: { slug: post.slug }, ip: getClientIp(req) });
  return NextResponse.json({ post }, { status: 201 });
});
