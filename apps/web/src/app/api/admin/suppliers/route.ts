import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { encrypt } from '@accszone/core';
import { adminRoute, badRequest, parseBody } from '@/lib/admin-route';
import { supplierSchema } from '@/lib/admin-schemas';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

export const POST = adminRoute(
  async (req, _ctx, user) => {
    const { apiKey, ...data } = await parseBody(req, supplierSchema);
    if (!apiKey) throw badRequest('Nhập API key', { apiKey: ['Bắt buộc khi tạo mới'] });

    // API key của web gốc lưu MÃ HÓA (AES-256-GCM), không bao giờ trả về client
    const supplier = await prisma.supplier.create({ data: { ...data, apiKeyEnc: encrypt(apiKey) }, select: { id: true } });
    await writeAudit({ actorId: user.id, action: 'supplier.create', entity: 'Supplier', entityId: supplier.id, after: data, ip: getClientIp(req) });
    return NextResponse.json({ supplier }, { status: 201 });
  },
  { superAdminOnly: true },
);
