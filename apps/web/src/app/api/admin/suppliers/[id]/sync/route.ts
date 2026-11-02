import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, badRequest, notFound } from '@/lib/admin-route';
import { enqueueSupplierSync, workerOnline } from '@/lib/queue';

type Ctx = { params: Promise<{ id: string }> };

// Đưa job đồng bộ vào queue; worker xử lý và ghi kết quả vào audit log
export const POST = adminRoute<Ctx>(async (_req, { params }, user) => {
  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { id }, select: { isActive: true } });
  if (!supplier) throw notFound('Nhà cung cấp không tồn tại');
  if (!supplier.isActive) throw badRequest('Nhà cung cấp đang tắt');

  const [jobId, online] = await Promise.all([enqueueSupplierSync(id, user.id), workerOnline()]);
  return NextResponse.json({ jobId, workerOnline: online }, { status: 202 });
});
