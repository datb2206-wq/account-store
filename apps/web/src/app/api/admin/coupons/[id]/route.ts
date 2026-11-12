import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { toggleSchema } from '@/lib/marketing-schemas';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const { isActive } = await parseBody(req, toggleSchema);
  const coupon = await prisma.coupon.update({ where: { id }, data: { isActive } });
  await writeAudit({ actorId: user.id, action: 'coupon.update', entity: 'Coupon', entityId: id, after: { isActive }, ip: getClientIp(req) });
  return NextResponse.json({ coupon });
}, { superAdminOnly: true });

// Đơn đã dùng mã vẫn giữ số tiền được giảm (couponId -> NULL)
export const DELETE = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const coupon = await prisma.coupon.delete({ where: { id } });
  await writeAudit({ actorId: user.id, action: 'coupon.delete', entity: 'Coupon', entityId: id, before: coupon, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
}, { superAdminOnly: true });
