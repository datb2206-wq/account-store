import type { Metadata } from 'next';
import Link from 'next/link';
import { EMAIL_DEFAULTS, EMAIL_VARIABLES, getEmailSettings } from '@accszone/core';
import { EmailSettingsForm } from '@/components/admin/email-settings-form';
import { PageHeader } from '@/components/admin/ui';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Email' };
export const dynamic = 'force-dynamic';

export default async function EmailSettingsPage() {
  await requireStaff();
  const settings = await getEmailSettings();
  return (
    <div className="space-y-5">
      <PageHeader title="Email (SMTP)">
        <Link href="/admin/email-campaigns" className="btn-ghost border border-zinc-200">Chiến dịch email →</Link>
      </PageHeader>
      {/* Không gửi mật khẩu SMTP xuống trình duyệt */}
      <EmailSettingsForm
        initial={{ ...settings, pass: '' }}
        hasPass={!!settings.pass}
        variables={{ order: EMAIL_VARIABLES.order, loginAlert: EMAIL_VARIABLES.loginAlert }}
        defaults={EMAIL_DEFAULTS.templates}
      />
    </div>
  );
}
