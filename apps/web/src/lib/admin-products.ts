import type { Prisma } from '@accszone/database';

export type ProductFilter = { q?: string; category?: string; status?: string; supplier?: string };

// Lọc theo nguồn hàng: 'local' = admin tự nhập, 'seller' = CTV, 'deleted' = API đã xóa kết nối, còn lại = id kết nối API
function supplierWhere(supplier: string): Prisma.ProductWhereInput {
  if (supplier === 'local') return { source: 'LOCAL', sellerId: null };
  if (supplier === 'seller') return { sellerId: { not: null } };
  if (supplier === 'deleted') return { source: { not: 'LOCAL' }, supplierId: null, sellerId: null };
  return { supplierId: supplier };
}

// Bộ lọc danh sách sản phẩm Admin (dùng chung cho trang danh sách và thao tác hàng loạt "tất cả theo bộ lọc")
export function productWhere({ q = '', category = '', status = '', supplier = '' }: ProductFilter): Prisma.ProductWhereInput {
  const s = status === 'active' || status === 'inactive' ? status : '';
  return {
    ...(supplier && supplierWhere(supplier)),
    ...(category && { categoryId: category }),
    ...(s && { isActive: s === 'active' }),
    ...(status === 'featured' && { isFeatured: true }),
    // name là Json đa ngôn ngữ -> tìm theo slug / tên gốc / tên tiếng Anh / tên tiếng Bồ (khách thấy)
    ...(q && {
      OR: [
        { slug: { contains: q, mode: 'insensitive' } },
        { name: { path: ['src'], string_contains: q, mode: 'insensitive' } },
        { name: { path: ['en'], string_contains: q, mode: 'insensitive' } },
        { name: { path: ['pt'], string_contains: q, mode: 'insensitive' } },
      ],
    }),
  };
}
