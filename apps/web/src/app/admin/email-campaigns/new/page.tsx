import type { Metadata } from 'next';
import Link from 'next/link';
import { getEmailSettings, smtpReady } from '@accszone/core';
import { prisma } from '@accszone/database';
import { EmailCampaignForm } from '@/components/admin/email-campaign';
import { PageHeader, Panel } from '@/components/admin/ui';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Tạo chiến dịch email' };

export default async function NewEmailCampaignPage() {
  await requireStaff();
  const [activeUsers, settings] = await Promise.all([prisma.user.count({ where: { status: 'ACTIVE', emailOptOut: false } }), getEmailSettings()]);
  return (
    <div className="space-y-5">
      <PageHeader title="Tạo chiến dịch Email Marketing">
        <Link href="/admin/email-campaigns" className="btn-ghost border border-zinc-200">← Danh sách</Link>
      </PageHeader>
      <Panel title="Chiến dịch mới">
        <EmailCampaignForm activeUsers={activeUsers} smtpOk={smtpReady(settings)} />
      </Panel>
    </div>
  );
}
