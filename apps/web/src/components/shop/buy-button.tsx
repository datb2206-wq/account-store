'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { apiRequest, newIdempotencyKey } from '@/lib/client-api';
import { CartIcon } from '@/components/icons';
import { useI18n } from '@/i18n/client';
import { fmt, formatFx } from '@/i18n/config';
import { Money } from '@/components/money';
import { translateError } from '@/i18n/errors';
import { rich } from '@/i18n/rich';

const TRIGGER = 'btn-buy min-w-24 shadow-sm';

export interface ShopProduct {
  id: string;
  name: string;
  description: string;
  price: string;
  stock: number;
  minQty: number;
  maxQty: number;
}

interface OrderView {
  code: string;
  productName: string;
  quantity: number;
  totalAmount: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  failReason: string | null;
}

interface PurchaseResult {
  order: OrderView;
  items: string[];
  balance?: string;
}

const POLL_MS = 3_000;

interface AppliedCoupon {
  code: string;
  percent: string;
  discount: string;
  total: string;
  qty: number;
}

export function BuyButton({ product, balance }: { product: ShopProduct; balance: string | null }) {
  const router = useRouter();
  const { locale, d, fx } = useI18n();
  const t = d.buy;
  const dialogRef = useRef<HTMLDialogElement>(null);
  // 1 key cho 1 lần mở form: bấm "Pay" nhiều lần / retry khi mất mạng đều gửi CÙNG key
  const idempotencyKey = useRef('');
  const [qty, setQty] = useState(product.minQty);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const maxBuy = Math.min(product.maxQty, product.stock);
  const soldOut = product.stock < product.minQty;

  // Hàng từ nhà cung cấp: đơn trả về PENDING -> hỏi lại server tới khi giao xong / hoàn tiền
  const pendingCode = result?.order.status === 'PENDING' ? result.order.code : null;
  useEffect(() => {
    if (!pendingCode) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/orders/${pendingCode}`, { cache: 'no-store' }).catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as PurchaseResult;
      if (data.order.status !== 'PENDING') {
        setResult((prev) => ({ ...data, balance: prev?.balance }));
        router.refresh(); // số dư thay đổi nếu được hoàn tiền
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pendingCode, router]);

  if (soldOut) {
    return <button className="btn-primary min-w-24 bg-zinc-200 px-3 whitespace-nowrap text-zinc-500 hover:bg-zinc-200" disabled>{t.soldOut}</button>;
  }
  if (balance === null) {
    return <Link href="/login?next=/" className={TRIGGER}><CartIcon size={15} /> {t.buy}</Link>;
  }

  // Hiển thị tạm phía client — số tiền thật do server tính bằng Decimal
  const subtotal = Number(product.price) * qty;
  // Mã chỉ đúng với số lượng lúc bấm Áp dụng; đổi số lượng thì phải áp dụng lại
  const activeCoupon = coupon && coupon.qty === qty ? coupon : null;
  const total = activeCoupon ? Number(activeCoupon.total) : subtotal;
  const notEnough = Number(balance) < total;
  const validQty = Number.isInteger(qty) && qty >= product.minQty && qty <= maxBuy;
  // Đã trừ tiền: giao xong (COMPLETED) hoặc đang chờ nhà cung cấp xác nhận (PENDING)
  const paid = result?.order.status === 'COMPLETED' || result?.order.status === 'PENDING';

  function open() {
    idempotencyKey.current = newIdempotencyKey();
    setQty(product.minQty);
    setError(null);
    setResult(null);
    setCoupon(null);
    setCouponInput('');
    setCouponError(null);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code || checking) return;
    setChecking(true);
    setCouponError(null);
    const res = await apiRequest<Omit<AppliedCoupon, 'qty'>>('/api/coupons/check', 'POST', { code, productId: product.id, quantity: qty });
    setChecking(false);
    if (!res.ok) {
      setCoupon(null);
      setCouponError(res.data.error ? translateError(res.data.error, d) : t.failed);
      return;
    }
    setCoupon({ ...res.data, qty });
  }

  async function pay() {
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await apiRequest<PurchaseResult>(
      '/api/orders',
      'POST',
      { productId: product.id, quantity: qty, couponCode: activeCoupon?.code },
      { 'Idempotency-Key': idempotencyKey.current },
    );
    setPending(false);
    if (!res.ok) {
      setError(res.data.error ? translateError(res.data.error, d) : t.failed);
      return;
    }
    setResult(res.data);
    router.refresh(); // cập nhật số dư trên header + số hàng còn lại
  }

  return (
    <>
      <button type="button" onClick={open} className={TRIGGER}><CartIcon size={15} /> {t.buy}</button>

      <dialog
        ref={dialogRef}
        onClick={(e) => e.target === dialogRef.current && !pending && close()}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl bg-white p-0 shadow-2xl backdrop:bg-zinc-900/50"
      >
        <div className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold">
              {!result ? <span key="n">{product.name}</span> : paid ? <span key="c">{t.titleComplete}</span> : <span key="r">{t.titleRefunded}</span>}
            </h2>
            <button type="button" onClick={close} disabled={pending} className="text-zinc-400 hover:text-zinc-700" aria-label={d.common.close}>✕</button>
          </div>

          {result ? (
            <>
              {/* Không hiện tài khoản ở đây: hàng được lưu vào Lịch sử mua hàng */}
              {paid && (
                <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-bold text-white" aria-hidden>✓</span>
                  <div className="space-y-1">
                    <p className="font-semibold">{rich(t.charged, { amount: <Money value={result.order.totalAmount} /> })}</p>
                    {result.order.status === 'PENDING' ? (
                      <p className="flex items-center gap-2">
                        <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-700" aria-hidden />
                        {t.sentPending}
                      </p>
                    ) : (
                      <p>{t.sentToHistory}</p>
                    )}
                  </div>
                </div>
              )}
              <p className="text-sm text-zinc-600">
                {t.order} <span className="font-mono font-medium text-zinc-900">{result.order.code}</span>
                {' · '}{result.order.quantity} × {product.name}
              </p>
              {result.order.failReason && result.order.status !== 'PENDING' && (
                <p className={`rounded-lg px-3 py-2 text-sm ${result.order.status === 'COMPLETED' ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-800'}`}>
                  {translateError(result.order.failReason, d)}
                </p>
              )}
              {result.balance && result.order.status !== 'REFUNDED' && (
                <p className="text-sm text-zinc-500">{rich(t.remainingBalance, { amount: <b className="text-zinc-900"><Money value={result.balance} /></b> })}</p>
              )}
              <div className="flex gap-2">
                <Link href="/dashboard/orders" className="btn-primary flex-1">{t.openHistory}</Link>
                <button type="button" onClick={close} className="btn-ghost border border-zinc-200">{d.common.close}</button>
              </div>
            </>
          ) : (
            <>
              {product.description && <p className="max-h-40 overflow-y-auto text-sm whitespace-pre-line text-zinc-600">{product.description}</p>}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-zinc-50 p-3">
                  <p className="text-zinc-500">{t.price}</p>
                  <p className="font-semibold"><Money value={product.price} /> <span className="font-normal text-zinc-400">{t.perItem}</span></p>
                  {fx && <p translate="no" className="text-xs text-zinc-400 tabular-nums">{formatFx(product.price, fx, locale)}</p>}
                </div>
                <div className="rounded-lg bg-zinc-50 p-3">
                  <p className="text-zinc-500">{t.inStock}</p>
                  <p className="font-semibold">{product.stock.toLocaleString('en-US')}</p>
                </div>
              </div>

              <div>
                <label htmlFor={`qty-${product.id}`} className="label">{t.quantity} <span className="font-normal text-zinc-400">({product.minQty}–{maxBuy})</span></label>
                <div className="flex gap-2">
                  <button type="button" className="btn-ghost border border-zinc-200" onClick={() => setQty((q) => Math.max(product.minQty, q - 1))}>−</button>
                  <input
                    id={`qty-${product.id}`}
                    type="number"
                    min={product.minQty}
                    max={maxBuy}
                    value={Number.isNaN(qty) ? '' : qty}
                    onChange={(e) => setQty(e.target.valueAsNumber)}
                    className="input text-center tabular-nums"
                  />
                  <button type="button" className="btn-ghost border border-zinc-200" onClick={() => setQty((q) => Math.min(maxBuy, (q || 0) + 1))}>+</button>
                </div>
              </div>

              <div>
                <label htmlFor={`coupon-${product.id}`} className="label">{t.couponLabel}</label>
                <div className="flex gap-2">
                  <input
                    id={`coupon-${product.id}`}
                    value={couponInput}
                    onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCoupon(null); setCouponError(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), applyCoupon())}
                    placeholder={t.couponPlaceholder}
                    maxLength={40}
                    className="input font-mono uppercase"
                  />
                  {activeCoupon ? (
                    <button type="button" className="btn-ghost border border-zinc-200 whitespace-nowrap" onClick={() => { setCoupon(null); setCouponInput(''); }}>{t.removeCoupon}</button>
                  ) : (
                    <button type="button" className="btn-ghost border border-zinc-200 whitespace-nowrap" disabled={!couponInput.trim() || checking || !validQty} onClick={applyCoupon}>
                      {checking ? <span key="c">…</span> : <span key="a">{t.applyCoupon}</span>}
                    </button>
                  )}
                </div>
                {couponError && <p className="mt-1 text-sm text-red-600">{couponError}</p>}
                {activeCoupon && <p className="mt-1 text-sm text-emerald-700">{fmt(t.couponApplied, { code: activeCoupon.code, percent: Number(activeCoupon.percent) })}</p>}
              </div>

              <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
                <div>
                  <p className="text-sm text-zinc-500">{t.total}</p>
                  {activeCoupon && validQty && (
                    <p className="text-xs text-zinc-400 tabular-nums">
                      <span className="line-through"><Money value={subtotal} /></span>{' '}
                      <span className="text-emerald-600">−<Money value={activeCoupon.discount} /></span>
                    </p>
                  )}
                  <p className="text-xl font-semibold tabular-nums">{validQty ? <Money value={total} /> : <span>—</span>}</p>
                  {fx && validQty && <p translate="no" className="text-xs text-zinc-400 tabular-nums">{formatFx(total, fx, locale)}</p>}
                </div>
                <div className="text-right text-sm">
                  <p className="text-zinc-500">{t.yourBalance}</p>
                  <p className={`font-medium tabular-nums ${notEnough ? 'text-red-600' : ''}`}><Money value={balance} /></p>
                </div>
              </div>

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              {notEnough && validQty && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t.insufficient} <Link href="/dashboard/deposit" className="font-medium underline">{t.topUpNow}</Link></p>
              )}

              <button type="button" onClick={pay} disabled={pending || !validQty || notEnough} className="btn-primary w-full">
                {/* Mỗi trạng thái 1 <span> riêng: đổi chữ = thay cả thẻ, an toàn khi trang đang bị Google Dịch */}
                {pending ? <span key="p">{t.processing}</span> : validQty ? <span key="v">{rich(t.pay, { amount: <Money value={total} /> })}</span> : <span key="i">{t.invalidQty}</span>}
              </button>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
