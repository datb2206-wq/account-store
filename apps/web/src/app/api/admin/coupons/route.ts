import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { couponSchema } from '@/lib/marketing-schemas';

export const POST = adminRoute(async (req, _ctx, user) => {
  const data = await parseBody(req, couponSchema);
  const coupon = await prisma.coupon.create({ data });
  await writeAudit({ actorId: user.id, action: 'coupon.create', entity: 'Coupon', entityId: coupon.id, after: coupon, ip: getClientIp(req) });
  return NextResponse.json({ coupon }, { status: 201 });
}, { superAdminOnly: true });
