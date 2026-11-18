import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@accszone/database';
import { adminRoute, notFound, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

// Bật/tắt nhanh 1 kết nối API từ trang danh sách
export const POST = adminRoute<Ctx>(
  async (req, { params }, user) => {
    const { id } = await params;
    const { isActive } = await parseBody(req, z.object({ isActive: z.boolean() }));
    const before = await prisma.supplier.findUnique({ where: { id }, select: { isActive: true } });
    if (!before) throw notFound('Nhà cung cấp không tồn tại');
    await prisma.supplier.update({ where: { id }, data: { isActive } });
    await writeAudit({ actorId: user.id, action: 'supplier.update', entity: 'Supplier', entityId: id, before, after: { isActive }, ip: getClientIp(req) });
    return NextResponse.json({ ok: true });
  },
  { superAdminOnly: true },
);
