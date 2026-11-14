import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslateJob, getTranslateSettings } from '@accszone/core';
import { prisma } from '@accszone/database';
import { LOCALE_LABEL, TranslateActions, TranslateSettingsForm } from '@/components/admin/translate-admin';
import { PageHeader, Panel } from '@/components/admin/ui';
import { AutoRefresh } from '@/components/auto-refresh';
import { LocalTime } from '@/components/local-time';
import { requireStaff } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { workerOnline } from '@/lib/queue';

export const metadata: Metadata = { title: 'Dịch sản phẩm' };

const JOB_STATUS = { RUNNING: ['Đang dịch', 'bg-sky-50 text-sky-700'], DONE: ['Hoàn tất', 'bg-emerald-50 text-emerald-700'], STOPPED: ['Đã dừng', 'bg-zinc-100 text-zinc-600'], FAILED: ['Lỗi', 'bg-red-50 text-red-700'] } as const;

export default async function TranslatePage() {
  const user = await requireStaff();
  const [settings, job, total, coverage, online] = await Promise.all([
    getTranslateSettings(),
    getTranslateJob(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.$queryRaw<{ id: number; ru: number; zh: number }[]>`
      SELECT count(*) FILTER (WHERE coalesce(name->>'id','') <> '')::int AS id,
             count(*) FILTER (WHERE coalesce(name->>'ru','') <> '')::int AS ru,
             count(*) FILTER (WHERE coalesce(name->>'zh','') <> '')::int AS zh
      FROM products WHERE "isActive" = true`,
    workerOnline().catch(() => false),
  ]);
  const { apiKey, ...publicSettings } = settings;
  const running = job?.status === 'RUNNING';
  const pct = job ? Math.round((job.cursor / Math.max(1, job.productIds.length)) * 100) : 0;
  const cov = coverage[0] ?? { id: 0, ru: 0, zh: 0 };

  return (
    <div className="space-y-5">
      <PageHeader title="Dịch sản phẩm" />
      <p className="text-sm text-zinc-500">
        Tên / mô tả sản phẩm (thường là tiếng Anh từ web gốc) được AI dịch sang ngôn ngữ khách đang xem. Bản tiếng Anh gốc không bị đổi; đồng bộ từ nguồn API chỉ cập nhật tiếng Anh nên bản dịch được giữ. Muốn tự đổi tên theo ý: mở sản phẩm, sửa ô tên của từng ngôn ngữ.
      </p>
      {!online && <p className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">Worker đang không chạy: lượt dịch sẽ chỉ chạy khi bật worker.</p>}

      <Panel title="Tiến độ" action={can(user, 'products.edit') && <TranslateActions running={running} canStart={!!apiKey && settings.targets.length > 0} />}>
        {running && <AutoRefresh everyMs={10_000} />}
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(LOCALE_LABEL) as (keyof typeof LOCALE_LABEL)[]).map((l) => (
            <div key={l} className="rounded-lg bg-zinc-50 p-3 text-sm">
              <p className="text-zinc-500">{LOCALE_LABEL[l]}{settings.targets.includes(l) ? '' : ' (không bật)'}</p>
              <p className="text-lg font-semibold tabular-nums">{cov[l].toLocaleString('en-US')} / {total.toLocaleString('en-US')} <span className="text-sm font-normal text-zinc-500">sản phẩm đã dịch tên</span></p>
            </div>
          ))}
        </div>
        {job && (
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${JOB_STATUS[job.status][1]}`}>{JOB_STATUS[job.status][0]}</span>
              <span className="text-zinc-600">
                Lượt gần nhất: {job.cursor.toLocaleString('en-US')} / {job.productIds.length.toLocaleString('en-US')} sản phẩm · đã ghi {job.translated.toLocaleString('en-US')} bản dịch · bỏ qua (đã có) {job.skipped.toLocaleString('en-US')}
                {job.failed > 0 && <span className="text-red-600"> · lỗi {job.failed.toLocaleString('en-US')}</span>}
              </span>
              <span className="text-xs text-zinc-400">cập nhật <LocalTime value={job.updatedAt} /></span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} /></div>
            {job.error && <p className="text-xs text-red-600">{job.error}</p>}
          </div>
        )}
        <p className="mt-3 text-xs text-zinc-400">Dịch theo từng sản phẩm đã chọn: vào <Link href="/admin/products" className="text-indigo-600 hover:underline">Sản phẩm</Link>, tích chọn rồi bấm &quot;🌐 Dịch&quot;.</p>
      </Panel>

      {can(user, 'settings.edit') && (
        <Panel title="Cấu hình">
          <TranslateSettingsForm initial={publicSettings} hasKey={!!apiKey} />
        </Panel>
      )}
    </div>
  );
}
