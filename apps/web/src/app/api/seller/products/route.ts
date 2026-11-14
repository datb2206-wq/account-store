import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { badRequest, parseBody, userRoute } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { requireActiveSeller, sellerProductSchema, sellerSlug } from '@/lib/seller';

const MAX_PRODUCTS = 200;

// CTV tạo sản phẩm mới: chờ admin duyệt (trừ khi bật tự duyệt) rồi mới hiện trên web
export const POST = userRoute(async (req, _ctx, user) => {
  const { seller, settings } = await requireActiveSeller(user.id);
  const input = await parseBody(req, sellerProductSchema, 'Please check the highlighted fields');
  const category = await prisma.category.findFirst({ where: { id: input.categoryId, isActive: true }, select: { id: true } });
  if (!category) throw badRequest('Choose a category', { categoryId: ['Choose a category'] });
  if ((await prisma.product.count({ where: { sellerId: seller.id } })) >= MAX_PRODUCTS) throw badRequest(`You can have at most ${MAX_PRODUCTS} products`);

  const approved = settings.autoApproveProducts;
  const product = await prisma.product.create({
    data: {
      slug: sellerSlug(input.name),
      categoryId: category.id,
      name: { en: input.name },
      description: input.description ? { en: input.description } : {},
      price: input.price.toFixed(6),
      minQty: input.minQty,
      maxQty: input.maxQty,
      source: 'LOCAL',
      sellerId: seller.id,
      approval: approved ? 'APPROVED' : 'PENDING',
      isActive: approved && input.isActive,
      sortOrder: 1000,
    },
    select: { id: true },
  });
  await writeAudit({ actorId: user.id, action: 'seller.product.create', entity: 'Product', entityId: product.id, after: { ...input, sellerId: seller.id }, ip: getClientIp(req) });
  return NextResponse.json({ id: product.id }, { status: 201 });
});
