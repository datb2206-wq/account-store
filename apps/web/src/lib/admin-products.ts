import { Prisma } from '@accszone/database';

export type ProductFilter = { q?: string; category?: string; status?: string; supplier?: string; tr?: string };

// Bản dịch tiếng Bồ: 'none' = chưa có bản dịch (khách thấy tên gốc), 'pending' = chưa duyệt / chưa khóa (gồm cả chưa dịch, AI dịch chưa duyệt).
// Dùng AnyNull vì NOT trên đường dẫn Json bỏ sót sản phẩm không có khóa đó.
export function translationWhere(tr: string): Prisma.ProductWhereInput | null {
  if (tr === 'none') return { OR: [{ name: { path: ['pt'], equals: Prisma.AnyNull } }, { name: { path: ['pt'], equals: '' } }] };
  if (tr === 'pending') return { OR: [{ name: { path: ['lock'], equals: Prisma.AnyNull } }, { name: { path: ['lock'], not: '1' } }] };
  return null;
}

// Lọc theo nguồn hàng: 'local' = admin tự nhập, 'seller' = CTV, 'deleted' = API đã xóa kết nối, còn lại = id kết nối API
function supplierWhere(supplier: string): Prisma.ProductWhereInput {
  if (supplier === 'local') return { source: 'LOCAL', sellerId: null };
  if (supplier === 'seller') return { sellerId: { not: null } };
  if (supplier === 'deleted') return { source: { not: 'LOCAL' }, supplierId: null, sellerId: null };
  return { supplierId: supplier };
}

// Bộ lọc danh sách sản phẩm Admin (dùng chung cho trang danh sách và thao tác hàng loạt "tất cả theo bộ lọc")
export function productWhere({ q = '', category = '', status = '', supplier = '', tr = '' }: ProductFilter): Prisma.ProductWhereInput {
  const s = status === 'active' || status === 'inactive' ? status : '';
  const trWhere = translationWhere(tr);
  return {
    ...(trWhere && { AND: [trWhere] }),
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
