import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { ProductForm } from '@/components/admin/product-form';
import { requireStaff } from '@/lib/auth';
import { treeOptions } from '@/lib/category-tree';

export const metadata: Metadata = { title: 'Thêm sản phẩm' };

export default async function NewProductPage() {
  await requireStaff();
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, parentId: true, name: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/products" className="text-sm text-zinc-500 hover:underline">← Sản phẩm</Link>
        <h1 className="mt-1 text-2xl font-semibold">Thêm sản phẩm</h1>
      </div>
      {categories.length === 0 ? (
        <div className="card text-sm text-zinc-600">
          Cần tạo ít nhất 1 danh mục trước.{' '}
          <Link href="/admin/categories" className="font-medium text-blue-600 hover:underline">Tạo danh mục →</Link>
        </div>
      ) : (
        <ProductForm categoryOptions={treeOptions(categories)} />
      )}
    </div>
  );
}
