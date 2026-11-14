import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { ActionButton, QuickForm } from '@/components/admin/quick-form';
import { FilterBar, PageHeader, Panel } from '@/components/admin/ui';
import { LocalTime } from '@/components/local-time';
import { Pagination } from '@/components/pagination';
import { requireStaff } from '@/lib/auth';
import { getSecurity } from '@/lib/security';
import { buildHref } from '@/lib/url';

export const metadata: Metadata = { title: 'Block IP' };

const PAGE_SIZE = 30;

export default async function BlockIpPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const where = q ? { ip: { contains: q } } : {};
  const [total, rows] = await Promise.all([
    prisma.blockedIp.count({ where }),
    prisma.blockedIp.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  const now = new Date();
  const security = await getSecurity();

  return (
    <div className="space-y-5">
      <PageHeader title="Block IP" count={total} />

      <Panel title="Thêm IP cần chặn">
        <QuickForm
          url="/api/admin/blocked-ips"
          submitLabel="+ Chặn IP"
          columns={3}
          fields={[
            { name: 'ip', label: 'Địa chỉ IP', placeholder: 'VD: 113.161.0.1', required: true },
            { name: 'reason', label: 'Lý do', placeholder: 'VD: Spam đơn hàng', required: true },
            { name: 'days', label: 'Chặn trong (ngày)', type: 'number', placeholder: 'Để trống = vĩnh viễn' },
          ]}
        />
        <p className="mt-3 text-xs text-zinc-400">
          IP bị chặn không đăng nhập, đăng ký, mua hàng hay tạo lệnh nạp được. Hệ thống tự chặn {security.autoBlockHours} giờ IP đăng nhập sai {security.loginFailIpLimit} lần trong 15 phút (đổi ở <a href="/admin/security" className="text-indigo-600 hover:underline">Cài đặt bảo mật</a>).
        </p>
      </Panel>

      <Panel title="Danh sách IP bị chặn">
        <div className="space-y-4">
          <FilterBar resetHref="/admin/block-ip" active={!!q}>
            <input name="q" defaultValue={q} placeholder="Tìm IP" className="input w-56" />
          </FilterBar>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Địa chỉ IP</th><th>Lần sai</th><th>Trạng thái</th><th>Lý do</th><th>Chặn lúc</th><th>Hết hạn</th><th /></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-zinc-400">Chưa có IP nào bị chặn</td></tr>}
                {rows.map((r) => {
                  const active = !r.expiresAt || r.expiresAt > now;
                  return (
                    <tr key={r.id} className="odd:bg-zinc-50/60">
                      <td className="font-mono">
                        <Link href={buildHref('/admin/activity', { ip: r.ip })} className="hover:text-indigo-600" title="Xem nhật ký của IP này">{r.ip}</Link>
                      </td>
                      <td><span className="rounded bg-sky-500 px-1.5 py-0.5 text-xs font-semibold text-white">{r.attempts}</span></td>
                      <td>
                        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${active ? 'bg-red-500 text-white' : 'bg-zinc-100 text-zinc-500'}`}>{active ? 'Banned' : 'Đã hết hạn'}</span>
                        {!r.createdById && <span className="ml-1 text-[11px] text-zinc-400">tự động</span>}
                      </td>
                      <td className="max-w-sm text-sm">{r.reason}</td>
                      <td className="text-xs whitespace-nowrap text-zinc-500"><LocalTime value={r.createdAt} /></td>
                      <td className="text-xs whitespace-nowrap text-zinc-500">{r.expiresAt ? <LocalTime value={r.expiresAt} /> : 'Vĩnh viễn'}</td>
                      <td className="text-right"><ActionButton url={`/api/admin/blocked-ips/${r.id}`} confirmText={`Gỡ chặn ${r.ip}?`} label="Gỡ chặn" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} hrefFor={(p) => buildHref('/admin/block-ip', { q, page: p > 1 ? p : undefined })} />
        </div>
      </Panel>
    </div>
  );
}
