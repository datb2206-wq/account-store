import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Không có quyền' };

export default async function ForbiddenPage() {
  const user = await requireStaff();
  return (
    <div className="mx-auto max-w-lg rounded-xl bg-white p-8 text-center shadow-sm">
      <p className="text-4xl" aria-hidden>🔒</p>
      <h1 className="mt-3 text-lg font-semibold text-zinc-800">Bạn không có quyền truy cập trang này</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Vai trò hiện tại: <b>{user.adminRole?.name ?? (user.role === 'STAFF' ? 'Nhân viên' : user.role)}</b>. Liên hệ Super Admin nếu bạn cần thêm quyền.
      </p>
      <Link href="/dashboard" className="btn-ghost mt-5 inline-flex border border-zinc-200">Về trang tài khoản</Link>
    </div>
  );
}
