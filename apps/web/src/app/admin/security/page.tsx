import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminGatePanel } from '@/components/admin/admin-gate-panel';
import { SecurityForm } from '@/components/admin/security-form';
import { PageHeader } from '@/components/admin/ui';
import { requireStaff } from '@/lib/auth';
import { GATE_PATH, getGateToken } from '@/lib/admin-gate';
import { getSiteUrl } from '@/lib/site';
import { getSecurity } from '@/lib/security';

export const metadata: Metadata = { title: 'Cài đặt bảo mật' };
export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  const user = await requireStaff();
  const settings = await getSecurity();
  // Link bí mật chỉ super admin xem được
  const gate = user.role === 'SUPER_ADMIN' ? await getGateToken() : '';
  const gateUrl = gate ? `${await getSiteUrl()}${GATE_PATH}${gate}` : null;
  // Không gửi Secret Key xuống trình duyệt
  const safe = { ...settings, captcha: { ...settings.captcha, secretKey: '' } };

  return (
    <div className="space-y-5">
      <PageHeader title="Cài đặt bảo mật">
        <Link href="/admin/block-ip" className="btn-ghost border border-zinc-200">Danh sách IP bị chặn</Link>
      </PageHeader>
      {user.role === 'SUPER_ADMIN' && <AdminGatePanel url={gateUrl} />}
      <SecurityForm initial={safe} hasSecret={!!settings.captcha.secretKey} />
    </div>
  );
}
