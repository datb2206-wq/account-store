import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, badRequest, conflict, notFound, parseBody } from '@/lib/admin-route';
import { categorySchema } from '@/lib/admin-schemas';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

// Chặn vòng lặp cây danh mục: cha mới không được là chính nó hoặc 1 danh mục con/cháu của nó
async function assertValidParent(id: string, parentId: string | null) {
  if (!parentId) return;
  const invalid = (msg: string) => badRequest(msg, { parentId: [msg] });
  if (parentId === id) throw invalid('Không thể chọn chính danh mục này làm cha');

  let current: string | null = parentId;
  for (let depth = 0; current && depth < 50; depth++) {
    if (current === id) throw invalid('Không thể chọn danh mục con làm cha');
    const node: { parentId: string | null } | null = await prisma.category.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    if (!node) throw invalid('Danh mục cha không tồn tại');
    current = node.parentId;
  }
}

export const PATCH = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const data = await parseBody(req, categorySchema);
  const before = await prisma.category.findUnique({ where: { id } });
  if (!before) throw notFound('Danh mục không tồn tại');
  await assertValidParent(id, data.parentId);

  const category = await prisma.category.update({ where: { id }, data });
  await writeAudit({
    actorId: user.id,
    action: 'category.update',
    entity: 'Category',
    entityId: id,
    before,
    after: category,
    ip: getClientIp(req),
  });
  return NextResponse.json({ category });
});

export const DELETE = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!category) throw notFound('Danh mục không tồn tại');
  if (category._count.products > 0) {
    throw conflict(`Danh mục đang có ${category._count.products} sản phẩm. Hãy chuyển hoặc xóa sản phẩm trước.`);
  }

  // Danh mục con (nếu có) tự động thành danh mục gốc nhờ onDelete: SetNull
  await prisma.category.delete({ where: { id } });
  await writeAudit({
    actorId: user.id,
    action: 'category.delete',
    entity: 'Category',
    entityId: id,
    before: category,
    ip: getClientIp(req),
  });
  return NextResponse.json({ ok: true });
});
