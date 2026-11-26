import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type Prisma } from '@accszone/database';
import { TranslateReviewTable, type ReviewRow } from '@/components/admin/translate-review';
import { FilterBar, PageHeader, Panel } from '@/components/admin/ui';
import { Pagination } from '@/components/pagination';
import { requireStaff } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { buildHref } from '@/lib/url';

export const metadata: Metadata = { title: 'Duyệt bản dịch' };

const PER_PAGE = 30;
const asMap = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {});
const srcOf = (v: unknown) => {
  const m = asMap(v);
  return m.src ?? m.en ?? '';
};

export default async function TranslateReviewPage({ searchParams }: { searchParams: Promise<{ q?: string; lock?: string; page?: string }> }) {
  const user = await requireStaff();
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 200) || undefined;
  const lock = params.lock === 'yes' || params.lock === 'no' ? params.lock : undefined;
  const page = Math.max(1, Number(params.page) || 1);

  // Tìm theo tên gốc hoặc tên tiếng Bồ (jsonb -> text)
  const ids = q
    ? (await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM products WHERE "isActive" AND (name::text ILIKE ${'%' + q + '%'} OR description::text ILIKE ${'%' + q + '%'})`).map((r) => r.id)
    : null;
  const where: Prisma.ProductWhereInput = {
    isActive: true,
    ...(ids && { id: { in: ids } }),
  };
  let rowsRaw = await prisma.product.findMany({
    where,
    select: { id: true, name: true, description: true, category: { select: { name: true } } },
    orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  if (lock) rowsRaw = rowsRaw.filter((p) => !!asMap(p.name).lock === (lock === 'yes'));
  const total = rowsRaw.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const rows: ReviewRow[] = rowsRaw.slice((page - 1) * PER_PAGE, page * PER_PAGE).map((p) => {
    const cat = asMap(p.category?.name);
    return {
      id: p.id,
      category: cat.pt || cat.src || cat.en || '',
      srcName: srcOf(p.name),
      srcDesc: srcOf(p.description),
      name: asMap(p.name).pt ?? '',
      description: asMap(p.description).pt ?? '',
      locked: !!asMap(p.name).lock,
    };
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Duyệt bản dịch" count={total} />
      <p className="text-sm text-zinc-500">
        Bên trái là tên / mô tả <b>gốc từ nguồn</b>, bên phải là <b>bản tiếng Bồ đang hiện trên web</b>. Sai chỗ nào sửa thẳng vào ô rồi bấm <b>Lưu + khóa</b> (khóa để &quot;Dịch lại tất cả&quot; và đồng bộ API không ghi đè).
        Nút <b>AI gợi ý</b> luôn dịch lại <b>từ tên gốc</b> và chỉ điền vào ô để bạn xem, chưa ghi vào web. Sửa 1 cụm sai lặp ở nhiều sản phẩm thì dùng <Link href="/admin/translate" className="text-indigo-600 hover:underline">Tìm &amp; thay thế</Link>.
      </p>
      <Panel bodyClassName="p-4">
        <FilterBar resetHref="/admin/translate/review" active={!!q || !!lock}>
          <input name="q" defaultValue={q} placeholder="Tìm trong tên gốc / tiếng Bồ…" className="input h-9 w-72" />
          <select name="lock" defaultValue={lock ?? ''} className="input h-9 w-auto py-0">
            <option value="">Tất cả</option>
            <option value="no">Chưa khóa (chưa duyệt)</option>
            <option value="yes">Đã khóa (đã duyệt)</option>
          </select>
        </FilterBar>
      </Panel>
      <Panel bodyClassName="p-0">
        {can(user, 'products.edit') ? <TranslateReviewTable rows={rows} /> : <p className="p-5 text-sm text-zinc-500">Bạn không có quyền sửa sản phẩm.</p>}
      </Panel>
      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => buildHref('/admin/translate/review', { q, lock, page: p > 1 ? p : undefined })} />
    </div>
  );
}
