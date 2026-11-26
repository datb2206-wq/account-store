import type { Prisma } from '@accszone/database';

export type ProductFilter = { q?: string; category?: string; status?: string };

// Bộ lọc danh sách sản phẩm Admin (dùng chung cho trang danh sách và thao tác hàng loạt "tất cả theo bộ lọc")
export function productWhere({ q = '', category = '', status = '' }: ProductFilter): Prisma.ProductWhereInput {
  const s = status === 'active' || status === 'inactive' ? status : '';
  return {
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
