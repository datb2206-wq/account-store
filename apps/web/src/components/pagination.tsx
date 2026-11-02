import Link from 'next/link';

const VI_LABELS = { prev: '← Trước', next: 'Sau →', page: 'Trang {page} / {total}' };

export function Pagination({
  page,
  totalPages,
  hrefFor,
  labels = VI_LABELS,
}: {
  page: number;
  totalPages: number;
  hrefFor: (p: number) => string;
  labels?: { prev: string; next: string; page: string };
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      {page > 1 && <Link href={hrefFor(page - 1)} className="btn-ghost">{labels.prev}</Link>}
      <span className="text-zinc-500">{labels.page.replace('{page}', String(page)).replace('{total}', String(totalPages))}</span>
      {page < totalPages && <Link href={hrefFor(page + 1)} className="btn-ghost">{labels.next}</Link>}
    </div>
  );
}
