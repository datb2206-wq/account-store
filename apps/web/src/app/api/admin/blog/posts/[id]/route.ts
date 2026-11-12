import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { z } from 'zod';
import { adminRoute, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { blogPostSchema } from '@/lib/marketing-schemas';

type Ctx = { params: Promise<{ id: string }> };

// Sửa cả bài, hoặc chỉ bật / tắt hiển thị ({ isPublished })
const patchSchema = z.union([z.object({ isPublished: z.boolean() }).strict(), blogPostSchema]);

export const PATCH = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const data = await parseBody(req, patchSchema);
  const post = await prisma.blogPost.update({ where: { id }, data, select: { id: true, slug: true, isPublished: true } });
  await writeAudit({ actorId: user.id, action: 'blog.post.update', entity: 'BlogPost', entityId: id, after: post, ip: getClientIp(req) });
  return NextResponse.json({ post });
});

export const DELETE = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const post = await prisma.blogPost.delete({ where: { id }, select: { id: true, title: true, slug: true } });
  await writeAudit({ actorId: user.id, action: 'blog.post.delete', entity: 'BlogPost', entityId: id, before: post, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});
