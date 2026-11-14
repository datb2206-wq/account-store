import type { Metadata } from 'next';
import { AUTOMATION_TYPES, isAutomationType } from '@accszone/core';
import { prisma } from '@accszone/database';
import { AutomationActions, AutomationForm } from '@/components/admin/automation-panel';
import { PageHeader, Panel } from '@/components/admin/ui';
import { LocalTime } from '@/components/local-time';
import { requireStaff } from '@/lib/auth';
import { humanizeSeconds } from '@/lib/duration';
import { can } from '@/lib/permissions';

export const metadata: Metadata = { title: 'Tự động hóa' };

export default async function AutomationsPage() {
  const user = await requireStaff();
  const tasks = await prisma.automationTask.findMany({ orderBy: { createdAt: 'desc' } });
  const editable = can(user, 'automations.edit');
  const types = Object.entries(AUTOMATION_TYPES).map(([value, t]) => ({ value, label: t.label, hint: t.hint }));

  return (
    <div className="space-y-5">
      <PageHeader title="Tự động hóa" count={tasks.length} />
      <p className="text-sm text-zinc-500">
        Worker tự chạy các công việc đang bật <b>mỗi 5 phút</b>, không cần cài cron. Mỗi lượt xóa tối đa 5.000 dòng, phần còn lại xóa ở lượt sau.
        Dữ liệu đã xóa <b>không khôi phục được</b>.
      </p>

      {editable && (
        <Panel title="Thêm công việc cần tự động">
          <AutomationForm types={types} />
        </Panel>
      )}

      <Panel title="Danh sách công việc tự động" bodyClassName="overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Tên công việc</th><th>Loại</th><th>Xóa dữ liệu cũ hơn</th><th>Trạng thái</th><th>Lần chạy gần nhất</th><th /></tr>
          </thead>
          <tbody>
            {tasks.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-zinc-400">Chưa có công việc nào</td></tr>}
            {tasks.map((t) => (
              <tr key={t.id} className="odd:bg-zinc-50/60">
                <td className="font-medium text-zinc-800">{t.name}</td>
                <td className="text-sm">{isAutomationType(t.type) ? AUTOMATION_TYPES[t.type].label : t.type}</td>
                <td className="text-sm whitespace-nowrap">{humanizeSeconds(t.olderThanSec)}</td>
                <td>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${t.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                    {t.isActive ? 'Đang bật' : 'Đã tắt'}
                  </span>
                </td>
                <td className="text-xs text-zinc-500">
                  {t.lastRunAt ? <LocalTime value={t.lastRunAt} /> : 'Chưa chạy'}
                  {t.lastResult && <p className={t.lastResult.startsWith('Lỗi') ? 'text-red-600' : 'text-zinc-600'}>{t.lastResult}</p>}
                </td>
                <td className="text-right">{editable && <AutomationActions id={t.id} name={t.name} isActive={t.isActive} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
