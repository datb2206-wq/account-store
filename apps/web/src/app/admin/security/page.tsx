import type { Metadata } from 'next';
import Link from 'next/link';
import { SecurityForm } from '@/components/admin/security-form';
import { PageHeader } from '@/components/admin/ui';
import { requireStaff } from '@/lib/auth';
import { getSecurity } from '@/lib/security';

export const metadata: Metadata = { title: 'Cài đặt bảo mật' };
export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  await requireStaff();
  const settings = await getSecurity();
  // Không gửi Secret Key xuống trình duyệt
  const safe = { ...settings, captcha: { ...settings.captcha, secretKey: '' } };

  return (
    <div className="space-y-5">
      <PageHeader title="Cài đặt bảo mật">
        <Link href="/admin/block-ip" className="btn-ghost border border-zinc-200">Danh sách IP bị chặn</Link>
      </PageHeader>
      <SecurityForm initial={safe} hasSecret={!!settings.captcha.secretKey} />
    </div>
  );
}
