import type { Metadata } from 'next';
import Link from 'next/link';
import { verifyUnsubscribeToken } from '@accszone/core';
import { UnsubscribeButton } from './unsubscribe-button';

export const metadata: Metadata = { title: 'Unsubscribe', robots: { index: false } };

// Trang hủy nhận email chiến dịch. Cần bấm xác nhận (không tự hủy khi mở link) để trình quét link của
// hộp thư không vô tình hủy giúp khách.
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ u?: string; t?: string }> }) {
  const { u = '', t = '' } = await searchParams;
  const valid = !!u && !!t && verifyUnsubscribeToken(u, t);
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-md space-y-4 p-6 text-center">
        <h1 className="text-lg font-semibold">Hủy nhận email / Unsubscribe</h1>
        {valid ? (
          <>
            <p className="text-sm text-zinc-600">
              Bạn sẽ không nhận email thông báo, khuyến mãi từ chúng tôi nữa. Email về đơn hàng của bạn vẫn được gửi.
              <br />
              <span className="text-zinc-400">You will no longer receive promotional emails. Order emails are not affected.</span>
            </p>
            <UnsubscribeButton u={u} t={t} />
          </>
        ) : (
          <p className="text-sm text-red-600">Link không hợp lệ hoặc đã hết hạn. / This link is invalid.</p>
        )}
        <Link href="/" className="block text-sm text-blue-600 hover:underline">← Trang chủ / Home</Link>
      </div>
    </main>
  );
}
