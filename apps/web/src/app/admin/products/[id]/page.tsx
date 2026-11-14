import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@accszone/database';
import { ProductForm, type ProductFormValues } from '@/components/admin/product-form';
import { requireStaff } from '@/lib/auth';
import { treeOptions } from '@/lib/category-tree';

export const metadata: Metadata = { title: 'Sửa sản phẩm' };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const [product, categories] = await Promise.all([
    prisma.product.findUnique({ where: { id } }),
    prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, parentId: true, name: true },
    }),
  ]);
  if (!product) notFound();

  // Decimal không truyền thẳng sang Client Component được -> đổi sang string
  const initial: ProductFormValues = {
    slug: product.slug,
    categoryId: product.categoryId,
    name: product.name as ProductFormValues['name'],
    description: (product.description ?? {}) as ProductFormValues['description'],
    price: product.price.toString(),
    costPrice: product.costPrice?.toString() ?? '',
    minQty: product.minQty,
    maxQty: product.maxQty,
    sortOrder: product.sortOrder,
    isActive: product.isActive,
    isFeatured: product.isFeatured,
  };

  return <ProductForm productId={product.id} initial={initial} categoryOptions={treeOptions(categories)} />;
}
