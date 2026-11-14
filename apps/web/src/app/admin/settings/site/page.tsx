import type { Metadata } from 'next';
import { SiteExtrasForm } from '@/components/admin/site-extras-form';
import { PageHeader } from '@/components/admin/ui';
import { requireStaff } from '@/lib/auth';
import { getSiteUrl } from '@/lib/site';
import { getSiteExtras } from '@/lib/site-extras';

export const metadata: Metadata = { title: 'Cài đặt website' };

export default async function SiteExtrasPage() {
  await requireStaff();
  const [extras, siteUrl] = await Promise.all([getSiteExtras(), getSiteUrl()]);
  return (
    <div className="space-y-5">
      <PageHeader title="Cài đặt website" />
      <p className="text-sm text-zinc-500">Tên website, logo, liên hệ hỗ trợ và chế độ bảo trì nằm ở trang <a href="/admin/settings" className="text-indigo-600 hover:underline">Cài đặt</a>.</p>
      <SiteExtrasForm initial={extras} siteUrl={siteUrl} />
    </div>
  );
}
