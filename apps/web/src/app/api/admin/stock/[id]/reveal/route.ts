import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, notFound } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { decrypt } from '@accszone/core';
import { getClientIp } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

// Xem nội dung gốc của 1 tài khoản trong kho. Chỉ SUPER_ADMIN, và mỗi lần xem đều ghi audit log.
export const POST = adminRoute<Ctx>(
  async (req, { params }, user) => {
    const { id } = await params;
    const item = await prisma.stockItem.findUnique({ where: { id }, select: { id: true, content: true, productId: true } });
    if (!item) throw notFound('Không tìm thấy hàng trong kho');

    await writeAudit({
      actorId: user.id,
      action: 'stock.reveal',
      entity: 'StockItem',
      entityId: id,
      after: { productId: item.productId },
      ip: getClientIp(req),
    });
    return NextResponse.json({ content: decrypt(item.content) });
  },
  { superAdminOnly: true },
);
