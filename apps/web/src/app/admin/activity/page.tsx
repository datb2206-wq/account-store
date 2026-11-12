import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type Prisma } from '@accszone/database';
import { FilterBar, PageHeader, Panel } from '@/components/admin/ui';
import { LocalTime } from '@/components/local-time';
import { Pagination } from '@/components/pagination';
import { vnDayRange } from '@/lib/admin-stats';
import { requireStaff } from '@/lib/auth';
import { buildHref } from '@/lib/url';

export const metadata: Metadata = { title: 'Nhật ký hoạt động' };

const PAGE_SIZE = 30;

// Tên dễ đọc cho các mã hành động ghi trong audit_logs
const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Đăng nhập',
  'auth.login_failed': '[Cảnh báo] Đăng nhập sai mật khẩu',
  'auth.register': 'Tạo tài khoản',
  'user.status': 'Khóa / mở khóa thành viên',
  'user.balance.adjust': 'Cộng / trừ tiền thành viên',
  'transaction.approve': 'Duyệt nạp tiền',
  'transaction.auto_approve': 'Tự động duyệt nạp tiền',
  'transaction.reject': 'Từ chối nạp tiền',
  'transaction.verify': 'Kiểm tra giao dịch USDT',
  'transaction.export': 'Xuất CSV giao dịch',
  'bank.webhook.unmatched': 'Webhook ngân hàng không khớp lệnh nạp',
  'product.create': 'Thêm sản phẩm',
  'product.update': 'Sửa sản phẩm',
  'product.delete': 'Xóa sản phẩm',
  'category.create': 'Thêm chuyên mục',
  'category.update': 'Sửa chuyên mục',
  'category.delete': 'Xóa chuyên mục',
  'stock.import': 'Nhập kho',
  'stock.reveal': 'Xem nội dung tài khoản trong kho',
  'stock.invalidate': 'Đánh dấu tài khoản lỗi',
  'stock.restore': 'Khôi phục tài khoản lỗi',
  'stock.delete': 'Xóa tài khoản trong kho',
  'order.deliver': 'Nhà cung cấp giao đơn API',
  'order.deliver.manual': 'Admin giao tay đơn API',
  'order.refund': 'Tự động hoàn tiền đơn API',
  'order.refund.manual': 'Admin hoàn tiền đơn hàng',
  'order.replace': 'Đổi tài khoản cho đơn hàng',
  'order.retry': 'Thử lại đơn hàng',
  'supplier.create': 'Thêm kết nối API',
  'supplier.update': 'Sửa kết nối API',
  'supplier.delete': 'Xóa kết nối API',
  'supplier.publish': 'Đăng bán sản phẩm từ API',
  'supplier.sync': 'Đồng bộ sản phẩm API',
  'supplier.sync.failed': '[Lỗi] Đồng bộ sản phẩm API thất bại',
  'config.update': 'Sửa cài đặt',
  'translations.update': 'Sửa bản dịch',
};

// Link tới đối tượng bị tác động (nếu có trang xem)
function entityHref(entity: string, id: string | null) {
  if (!id) return null;
  if (entity === 'Transaction') return `/admin/transactions/${id}`;
  if (entity === 'Order') return buildHref('/admin/orders', { q: id });
  if (entity === 'Product') return `/admin/products/${id}`;
  if (entity === 'Supplier') return `/admin/suppliers/${id}`;
  if (entity === 'User') return buildHref('/admin/users', { q: id });
  return null;
}

function userAgentOf(after: Prisma.JsonValue) {
  return after && typeof after === 'object' && !Array.isArray(after) && typeof after.userAgent === 'string' ? after.userAgent : null;
}

export default async function AdminLogsPage({ searchParams }: { searchParams: Promise<Partial<Record<string, string>>> }) {
  await requireStaff();
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const action = sp.action && sp.action in ACTION_LABEL ? sp.action : undefined;
  const ip = sp.ip?.trim() || undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const where: Prisma.AuditLogWhereInput = {
    action,
    ip: ip ? { contains: ip } : undefined,
    createdAt: vnDayRange(sp.from, sp.to),
    actor: q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }, { id: q }] } : undefined,
  };

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, action: true, entity: true, entityId: true, ip: true, after: true, createdAt: true, actor: { select: { id: true, email: true } } },
    }),
  ]);
  const filters = { q, action, ip, from: sp.from, to: sp.to };
  const filtered = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-5">
      <PageHeader title="Nhật ký hoạt động" count={total} />
      <Panel title="Nhật ký hoạt động">
        <div className="space-y-4">
          <FilterBar resetHref="/admin/activity" active={filtered}>
            <input name="q" defaultValue={q} placeholder="Email / username / ID" className="input w-56" />
            <select name="action" defaultValue={action ?? ''} className="input w-60">
              <option value="">Mọi hành động</option>
              {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input name="ip" defaultValue={ip} placeholder="Địa chỉ IP" className="input w-40" />
            <input type="date" name="from" defaultValue={sp.from} className="input w-40" title="Từ ngày" />
            <input type="date" name="to" defaultValue={sp.to} className="input w-40" title="Đến ngày" />
          </FilterBar>

          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>#</th><th>Người thực hiện</th><th>Hành động</th><th>Thời gian</th><th>IP</th><th>Thiết bị</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-zinc-400">Không có dữ liệu</td></tr>}
                {rows.map((r, i) => {
                  const href = entityHref(r.entity, r.entityId);
                  const warn = r.action === 'auth.login_failed';
                  return (
                    <tr key={r.id} className="odd:bg-zinc-50/60">
                      <td className="text-zinc-400 tabular-nums">{total - (page - 1) * PAGE_SIZE - i}</td>
                      <td className="max-w-56 truncate">
                        {r.actor ? (
                          <Link href={buildHref('/admin/activity', { q: r.actor.email })} className="font-medium text-indigo-600 hover:underline">{r.actor.email}</Link>
                        ) : (
                          <span className="rounded bg-sky-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">Hệ thống</span>
                        )}
                      </td>
                      <td className={warn ? 'text-amber-700' : ''}>
                        {ACTION_LABEL[r.action] ?? r.action}
                        {href && r.entity !== 'User' && (
                          <Link href={href} className="ml-1.5 font-mono text-xs text-zinc-400 hover:text-indigo-600">#{r.entityId!.slice(-8)}</Link>
                        )}
                      </td>
                      <td className="text-xs whitespace-nowrap text-zinc-500"><LocalTime value={r.createdAt} /></td>
                      <td>{r.ip && <Link href={buildHref('/admin/activity', { ip: r.ip })} className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-[11px] text-red-600">{r.ip}</Link>}</td>
                      <td className="max-w-md truncate text-xs text-zinc-500" title={userAgentOf(r.after) ?? undefined}>{userAgentOf(r.after) ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} hrefFor={(p) => buildHref('/admin/activity', { ...filters, page: p > 1 ? p : undefined })} />
        </div>
      </Panel>
    </div>
  );
}
