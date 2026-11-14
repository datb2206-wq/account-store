import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { CampaignActions } from '@/components/admin/email-campaign';
import { PageHeader, Panel } from '@/components/admin/ui';
import { LocalTime } from '@/components/local-time';
import { requireStaff } from '@/lib/auth';
import { can } from '@/lib/permissions';

export const metadata: Metadata = { title: 'Email Campaigns' };

const STATUS: Record<string, [string, string]> = {
  SENDING: ['Đang gửi', 'bg-sky-50 text-sky-700'],
  PAUSED: ['Tạm dừng', 'bg-amber-50 text-amber-700'],
  DONE: ['Đã gửi xong', 'bg-emerald-50 text-emerald-700'],
};

export default async function EmailCampaignsPage() {
  const user = await requireStaff();
  const editable = can(user, 'emails.edit');
  const campaigns = await prisma.emailCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, name: true, subject: true, recipients: true, status: true, total: true, sent: true, failed: true, lastError: true, createdAt: true },
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Email Campaigns" count={campaigns.length}>
        {editable && <Link href="/admin/email-campaigns/new" className="btn-primary">+ Tạo chiến dịch mới</Link>}
        <Link href="/admin/email" className="btn-ghost border border-zinc-200">Cấu hình SMTP</Link>
      </PageHeader>
      <p className="text-sm text-zinc-500">Worker gửi mỗi phút 30 email (cần worker đang chạy). Khách bấm &quot;Hủy nhận email&quot; trong email sẽ không nhận chiến dịch sau.</p>

      <Panel title="Danh sách chiến dịch" bodyClassName="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Chiến dịch</th><th>Người nhận</th><th>Tiến độ</th><th>Trạng thái</th><th>Ngày tạo</th><th /></tr></thead>
          <tbody>
            {campaigns.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-zinc-400">Chưa có chiến dịch nào</td></tr>}
            {campaigns.map((c) => {
              const done = c.sent + c.failed;
              const pct = c.total ? Math.min(100, Math.round((done / c.total) * 100)) : 100;
              const [label, tone] = STATUS[c.status] ?? [c.status, 'bg-zinc-100 text-zinc-600'];
              return (
                <tr key={c.id} className="odd:bg-zinc-50/60">
                  <td>
                    <p className="font-medium text-zinc-800">{c.name}</p>
                    <p className="max-w-xs truncate text-xs text-zinc-400">{c.subject}</p>
                  </td>
                  <td className="text-sm">{c.recipients === 'all' ? 'Tất cả thành viên' : 'Danh sách nhập tay'}</td>
                  <td className="min-w-48">
                    <div className="h-2 rounded-full bg-zinc-100"><div className="h-2 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} /></div>
                    <p className="mt-1 text-xs text-zinc-500 tabular-nums">
                      {c.sent.toLocaleString('vi-VN')} đã gửi{c.failed > 0 && <span className="text-red-600"> · {c.failed} lỗi</span>} / {c.total.toLocaleString('vi-VN')}
                    </p>
                    {c.lastError && <p className="max-w-xs truncate text-xs text-red-600" title={c.lastError}>{c.lastError}</p>}
                  </td>
                  <td><span className={`rounded px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span></td>
                  <td className="text-xs text-zinc-500"><LocalTime value={c.createdAt} /></td>
                  <td className="text-right">{editable && <CampaignActions id={c.id} name={c.name} status={c.status} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
