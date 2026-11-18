import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { encrypt, parseProxy } from '@accszone/core';
import { adminRoute, badRequest, notFound, parseBody } from '@/lib/admin-route';
import { supplierSchema } from '@/lib/admin-schemas';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

const publicFields = {
  id: true,
  name: true,
  adapter: true,
  baseUrl: true,
  priceMarkup: true,
  autoUpdatePrice: true,
  priceRounding: true,
  autoUpdateInfo: true,
  stripHtml: true,
  syncCategories: true,
  autoActivate: true,
  priceRate: true,
  isActive: true,
} as const;

export const PATCH = adminRoute<Ctx>(
  async (req, { params }, user) => {
    const { id } = await params;
    const { apiKey, proxy, clearProxy, ...data } = await parseBody(req, supplierSchema);
    if (proxy) {
      try {
        parseProxy(proxy);
      } catch (err) {
        throw badRequest('Proxy không hợp lệ', { proxy: [err instanceof Error ? err.message : 'Sai định dạng'] });
      }
    }
    const before = await prisma.supplier.findUnique({ where: { id }, select: publicFields });
    if (!before) throw notFound('Nhà cung cấp không tồn tại');

    await prisma.supplier.update({ where: { id }, data: { ...data, ...(apiKey && { apiKeyEnc: encrypt(apiKey) }), ...(proxy ? { proxyEnc: encrypt(proxy) } : clearProxy ? { proxyEnc: null } : {}) } });
    await writeAudit({
      actorId: user.id,
      action: 'supplier.update',
      entity: 'Supplier',
      entityId: id,
      before,
      after: { ...data, apiKeyChanged: !!apiKey, proxyChanged: !!proxy || clearProxy },
      ip: getClientIp(req),
    });
    return NextResponse.json({ ok: true });
  },
  { superAdminOnly: true },
);

// Sản phẩm/danh mục đã đồng bộ được giữ lại (supplierId -> null); đơn hàng cũ không bị ảnh hưởng
export const DELETE = adminRoute<Ctx>(
  async (req, { params }, user) => {
    const { id } = await params;
    const before = await prisma.supplier.findUnique({ where: { id }, select: publicFields });
    if (!before) throw notFound('Nhà cung cấp không tồn tại');
    await prisma.$transaction([
      // Ẩn hàng của nhà cung cấp này: không còn nguồn để giao
      prisma.product.updateMany({ where: { supplierId: id }, data: { isActive: false, externalStock: 0 } }),
      prisma.supplier.delete({ where: { id } }),
    ]);
    await writeAudit({ actorId: user.id, action: 'supplier.delete', entity: 'Supplier', entityId: id, before, ip: getClientIp(req) });
    return NextResponse.json({ ok: true });
  },
  { superAdminOnly: true },
);
