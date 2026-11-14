// Phân quyền admin (Admin > Admin Role).
//  - SUPER_ADMIN: toàn quyền.
//  - STAFF có vai trò: chỉ những quyền được tích trong vai trò.
//  - STAFF chưa gán vai trò: quyền nhân viên mặc định như trước khi có tính năng này
//    (mọi quyền trừ nhóm SUPER_ONLY).
// Quyền được kiểm tra tập trung theo đường dẫn (ROUTE_RULES) ở requireStaff() và adminRoute(),
// nên trang/API mới chỉ cần thêm 1 dòng vào ROUTE_RULES.
import type { Role } from '@accszone/database';

export const PERMISSION_GROUPS = [
  { group: 'Dashboard', items: [['dashboard.view', 'Xem thống kê tại Dashboard']] },
  { group: 'Nhật ký', items: [['logs.view', 'Xem nhật ký hoạt động & biến động số dư']] },
  { group: 'Tự động hóa', items: [['automations.view', 'Xem công việc tự động'], ['automations.edit', 'Thêm, sửa, xóa, chạy công việc tự động']] },
  { group: 'Bảo mật', items: [['security.view', 'Xem danh sách IP bị chặn'], ['security.edit', 'Thêm, xóa IP bị chặn']] },
  {
    group: 'Sản phẩm',
    items: [
      ['products.view', 'Xem chuyên mục, sản phẩm, kho hàng'],
      ['products.edit', 'Thêm, sửa, xóa chuyên mục, sản phẩm, nhập kho'],
      ['stock.reveal', 'Xem nội dung gốc tài khoản trong kho'],
    ],
  },
  {
    group: 'Kết nối API',
    items: [
      ['suppliers.view', 'Xem các kết nối API'],
      ['suppliers.sync', 'Đồng bộ & bật bán sản phẩm từ nguồn'],
      ['suppliers.edit', 'Thêm, sửa, xóa kết nối API (API key)'],
    ],
  },
  {
    group: 'Đơn hàng',
    items: [
      ['orders.view', 'Xem đơn hàng'],
      ['orders.manage', 'Giao tay, thử lại, đổi bảo hành'],
      ['orders.refund', 'Hoàn tiền đơn hàng'],
    ],
  },
  {
    group: 'Thành viên',
    items: [
      ['users.view', 'Xem danh sách thành viên'],
      ['users.edit', 'Khóa / mở khóa thành viên'],
      ['users.balance', 'Cộng / trừ số dư thành viên'],
    ],
  },
  { group: 'Nạp tiền', items: [['payments.view', 'Xem lịch sử nạp tiền, giao dịch'], ['payments.edit', 'Duyệt / từ chối nạp tiền']] },
  { group: 'Mã giảm giá', items: [['coupons.view', 'Xem mã giảm giá'], ['coupons.edit', 'Thêm, sửa, xóa mã giảm giá']] },
  { group: 'Khuyến mãi nạp', items: [['promotions.view', 'Xem mốc khuyến mãi nạp'], ['promotions.edit', 'Thêm, sửa, xóa mốc khuyến mãi']] },
  { group: 'Bài viết', items: [['blog.view', 'Xem bài viết & chuyên mục'], ['blog.edit', 'Viết, sửa, xóa bài viết & chuyên mục']] },
  { group: 'Phân quyền', items: [['roles.manage', 'Quản lý vai trò & gán quyền cho nhân viên (quyền rất cao)']] },
  { group: 'Cài đặt', items: [['settings.edit', 'Cài đặt, bảo mật, ngôn ngữ, tiền tệ, giao diện website']] },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]['items'][number][0];
export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.items.map(([p]) => p)) as Permission[];
export const isPermission = (p: string): p is Permission => (ALL_PERMISSIONS as string[]).includes(p);

// Trước đây chỉ SUPER_ADMIN làm được -> nhân viên chưa gán vai trò vẫn không có
const SUPER_ONLY: Permission[] = [
  'stock.reveal', 'suppliers.edit', 'orders.refund', 'automations.edit', 'users.edit', 'users.balance',
  'coupons.edit', 'promotions.edit', 'roles.manage', 'settings.edit',
];

export interface PermissionSubject {
  role: Role;
  adminRole?: { permissions: string[] } | null;
}

export function can(user: PermissionSubject | null | undefined, perm: Permission) {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role !== 'STAFF') return false;
  if (user.adminRole) return user.adminRole.permissions.includes(perm);
  return !SUPER_ONLY.includes(perm);
}

// Quyền cần cho 1 đường dẫn. Luật đầu tiên khớp thắng -> đặt luật cụ thể trước luật chung.
// method: undefined = mọi method; 'read' = GET/HEAD; 'write' = còn lại
type Rule = [prefix: string, perm: Permission | null, method?: 'read' | 'write', exact?: boolean];

const ROUTE_RULES: Rule[] = [
  // ---- Trang ----
  ['/admin/forbidden', null],
  ['/admin', 'dashboard.view', undefined, true],
  ['/admin/activity', 'logs.view'],
  ['/admin/balance-logs', 'logs.view'],
  ['/admin/automations', 'automations.view'],
  ['/admin/block-ip', 'security.view'],
  ['/admin/security', 'settings.edit'],
  ['/admin/products/new', 'products.edit'],
  ['/admin/categories', 'products.view'],
  ['/admin/products', 'products.view'],
  ['/admin/stock', 'products.view'],
  ['/admin/suppliers/new', 'suppliers.edit'],
  ['/admin/suppliers', 'suppliers.view'],
  ['/admin/orders', 'orders.view'],
  ['/admin/users', 'users.view'],
  ['/admin/transactions', 'payments.view'],
  ['/admin/coupons', 'coupons.view'],
  ['/admin/promotions', 'promotions.view'],
  ['/admin/blog/new', 'blog.edit'],
  ['/admin/blog', 'blog.view'],
  ['/admin/roles', 'roles.manage'],
  ['/admin/settings', 'settings.edit'],
  ['/admin/translations', 'settings.edit'],
  ['/admin/theme', 'settings.edit'],
  ['/admin/currencies', 'settings.edit'],
  ['/admin/telegram', 'settings.edit'],

  // ---- API ----
  ['/api/admin/adjustments', 'users.balance'],
  ['/api/admin/automations', 'automations.edit'],
  ['/api/admin/blocked-ips', 'security.edit'],
  ['/api/admin/security', 'settings.edit'],
  ['/api/admin/blog', 'blog.edit'],
  ['/api/admin/categories', 'products.edit'],
  ['/api/admin/products', 'products.edit'],
  ['/api/admin/stock/', 'stock.reveal'], // /api/admin/stock/[id]/reveal
  ['/api/admin/stock', 'products.edit'],
  ['/api/admin/config', 'settings.edit'],
  ['/api/admin/translations', 'settings.edit'],
  ['/api/admin/theme', 'settings.edit'],
  ['/api/admin/currencies', 'settings.edit'],
  ['/api/admin/telegram', 'settings.edit'],
  ['/api/admin/coupons', 'coupons.edit'],
  ['/api/admin/deposit-bonuses', 'promotions.edit'],
  ['/api/admin/orders/', 'orders.manage'],
  ['/api/admin/suppliers/', 'suppliers.sync'], // [id]/sync, [id]/publish; sửa/xóa [id] xử lý riêng bên dưới
  ['/api/admin/suppliers', 'suppliers.edit'],
  ['/api/admin/transactions/export', 'payments.view'],
  ['/api/admin/transactions', 'payments.edit'],
  ['/api/admin/users', 'users.edit'],
  ['/api/admin/roles', 'roles.manage'],
];

// Trả về: quyền cần có; null = chỉ cần là nhân viên; 'deny' = đường dẫn chưa khai báo (chỉ SUPER_ADMIN)
export function requiredPermission(pathname: string, method = 'GET'): Permission | null | 'deny' {
  const path = pathname.replace(/\/+$/, '') || '/';
  // Các đường dẫn con cần quyền khác quyền của nhóm
  if (/^\/api\/admin\/orders\/[^/]+\/refund$/.test(path)) return 'orders.refund';
  if (/^\/api\/admin\/suppliers\/[^/]+$/.test(path)) return 'suppliers.edit';
  if (/^\/api\/admin\/users\/[^/]+\/role$/.test(path)) return 'roles.manage';

  const write = method !== 'GET' && method !== 'HEAD';
  for (const [prefix, perm, m, exact] of ROUTE_RULES) {
    // "/x/" = chỉ đường dẫn con của /x; "/x" = chính /x và mọi đường dẫn con
    const hit = exact ? path === prefix : prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix || path.startsWith(`${prefix}/`);
    if (!hit) continue;
    if (m === 'read' && write) continue;
    if (m === 'write' && !write) continue;
    return perm;
  }
  return path.startsWith('/admin') || path.startsWith('/api/admin') ? 'deny' : null;
}

// Trang đích khi nhân viên vào /admin mà không có quyền Dashboard (theo thứ tự ưu tiên)
export const ADMIN_LANDING_PAGES = [
  '/admin/orders', '/admin/transactions', '/admin/products', '/admin/users', '/admin/suppliers',
  '/admin/blog', '/admin/coupons', '/admin/promotions', '/admin/activity', '/admin/block-ip', '/admin/settings',
];

export function canAccess(user: PermissionSubject | null | undefined, pathname: string, method = 'GET') {
  if (user?.role === 'SUPER_ADMIN') return true;
  const perm = requiredPermission(pathname, method);
  if (perm === 'deny') return false;
  if (perm === null) return user?.role === 'STAFF';
  return can(user, perm);
}
