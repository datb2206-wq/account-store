import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@accszone/database';
import { Badge } from '@/components/badge';
import { NavLink } from '@/components/nav-link';
import { requireStaff } from '@/lib/auth';
import { localized } from '@/lib/format';

export default async function ProductLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, name: true, isActive: true, source: true },
  });
  if (!product) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/products" className="text-sm text-zinc-500 hover:underline">← Sản phẩm</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{localized(product.name)}</h1>
          <Badge value={product.isActive ? 'Đang bán' : 'Đã ẩn'} tone={product.isActive ? 'green' : 'gray'} />
          {product.source === 'RESELLER' && <Badge value="RESELLER" tone="blue" />}
        </div>
      </div>
      <nav className="flex gap-1 border-b border-zinc-200 pb-2">
        <NavLink href={`/admin/products/${id}`} exact>Thông tin</NavLink>
        <NavLink href={`/admin/products/${id}/stock`}>Kho hàng</NavLink>
      </nav>
      {children}
    </div>
  );
}
