import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCtvSettings } from '@accszone/core';
import { prisma } from '@accszone/database';
import { fmt } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { requireUser } from '@/lib/auth';
import { treeOptions } from '@/lib/category-tree';
import { localized } from '@/lib/format';
import { ProductForm, StockBox } from '../../seller-client';

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return { title: d.seller.products };
}

// /dashboard/seller/products/new = tạo mới, còn lại = sửa sản phẩm của CTV
export default async function SellerProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const user = await requireUser();
  const [{ d, locale }, s, seller, { id }, sp] = await Promise.all([
    getI18n(),
    getCtvSettings(),
    prisma.seller.findUnique({ where: { userId: user.id }, select: { id: true, status: true } }),
    params,
    searchParams,
  ]);
  if (!s.enabled || seller?.status !== 'ACTIVE') redirect('/dashboard/seller');
  const t = d.seller;
  const isNew = id === 'new';

  const [product, categories] = await Promise.all([
    isNew ? null : prisma.product.findFirst({ where: { id, sellerId: seller.id } }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, parentId: true, name: true } }),
  ]);
  if (!isNew && !product) notFound();
  const counts = product
    ? Object.fromEntries((await prisma.stockItem.groupBy({ by: ['status'], where: { productId: product.id }, _count: true })).map((g) => [g.status, g._count]))
    : {};
  const options = treeOptions(categories.map((c) => ({ ...c, name: localized(c.name, locale) }))).map((o) => ({ id: o.id, label: o.label }));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/dashboard/seller/products" className="text-sm text-zinc-500 hover:underline">{t.back}</Link>
        <h1 className="mt-1 text-2xl font-semibold">{isNew ? t.addProduct : localized(product!.name, locale)}</h1>
        {product && <p className="mt-1 text-sm text-zinc-500">{t[`approval${product.approval}`]}{product.approval === 'REJECTED' && product.rejectReason ? ` · ${fmt(t.rejectedReason, { reason: product.rejectReason })}` : ''}</p>}
      </div>
      {sp.created && product?.approval === 'PENDING' && <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">{t.createdPending}</p>}

      <section className="card">
        <ProductForm
          approved={product?.approval === 'APPROVED'}
          categories={options}
          initial={{
            id: product?.id,
            name: product ? localized(product.name) : '',
            description: product ? localized(product.description) : '',
            categoryId: product?.categoryId ?? '',
            price: product ? Number(product.price).toString() : '',
            minQty: product?.minQty ?? 1,
            maxQty: product?.maxQty ?? 1000,
            isActive: product?.isActive ?? true,
          }}
        />
      </section>

      {product && (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{t.stockTitle}</h2>
            <span className="text-sm text-zinc-500">
              {t.colStock}: <b className="text-emerald-600">{(counts.AVAILABLE ?? 0).toLocaleString('en-US')}</b> · {t.colSold}: <b>{(counts.SOLD ?? 0).toLocaleString('en-US')}</b>
            </span>
          </div>
          <StockBox productId={product.id} />
        </section>
      )}
    </div>
  );
}
