import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminRoute, apiError, parseBody } from '@/lib/admin-route';
import { GATE_PATH, newGateToken, saveGateToken, setGateCookie } from '@/lib/admin-gate';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

const schema = z.object({ action: z.enum(['rotate', 'disable']) });

// Tạo / đổi / tắt link đăng nhập admin bí mật (chỉ super admin). Đổi link -> link cũ hết tác dụng,
// mọi admin / nhân viên phải mở link mới. Trình duyệt đang thao tác được ghi cookie mới luôn để không tự khóa mình.
export const POST = adminRoute(async (req, _ctx, user) => {
  if (user.role !== 'SUPER_ADMIN') throw apiError(403, 'Chỉ Super Admin được đổi link đăng nhập admin');
  const { action } = await parseBody(req, schema);
  const token = action === 'rotate' ? newGateToken() : '';
  await saveGateToken(token, user.id);
  await writeAudit({ actorId: user.id, action: action === 'rotate' ? 'security.admin_gate.rotate' : 'security.admin_gate.disable', entity: 'SystemConfig', entityId: 'security.adminGate', ip: getClientIp(req) });
  const site = `${req.headers.get('x-forwarded-proto') ?? 'https'}://${req.headers.get('host')}`;
  const res = NextResponse.json({ ok: true, url: token ? `${site}${GATE_PATH}${token}` : null });
  if (token) setGateCookie(res, token);
  return res;
}, { superAdminOnly: true });
