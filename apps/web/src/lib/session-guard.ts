// Chế độ "chỉ đăng nhập 1 thiết bị" (Admin > Bảo mật).
// Mỗi lần đăng nhập tạo 1 sid mới và ghi vào Redis là phiên hợp lệ duy nhất của tài khoản.
// Token mang sid khác (thiết bị cũ) bị từ chối ngay ở request kế tiếp, kể cả access token còn hạn.
import type { Role } from '@accszone/database';
import { REFRESH_TTL } from './jwt';
import { getRedis } from './redis';
import { getSecurity } from './security';

const key = (userId: string) => `auth:sid:${userId}`;

async function applies(role: Role) {
  const s = await getSecurity();
  return role === 'USER' ? s.singleSessionUser : s.singleSessionStaff;
}

// Gọi khi đăng nhập / đăng ký thành công: phiên này thành phiên duy nhất (nếu chế độ đang bật)
export async function claimSession(userId: string, role: Role, sid: string) {
  if (await applies(role)) await getRedis().set(key(userId), sid, 'EX', REFRESH_TTL);
}

// false = phiên đã bị thay thế bởi lần đăng nhập ở thiết bị khác
export async function sessionStillValid(userId: string, role: Role, sid: string | undefined) {
  if (!(await applies(role))) return true;
  const current = await getRedis().get(key(userId)).catch(() => null);
  // Chưa có phiên nào được ghi (vừa bật chế độ) -> cho qua; token cũ không có sid -> chỉ hợp lệ khi chưa ghi
  if (!current) return true;
  return current === sid;
}
