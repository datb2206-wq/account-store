import { NextResponse } from 'next/server';
import { clearEmailCache, CONFIG_SCHEMAS, getEmailSettings } from '@accszone/core';
import { prisma, type Prisma } from '@accszone/database';
import { adminRoute, badRequest } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp, readJson } from '@/lib/http';

// Lưu cấu hình email. pass để trống = giữ mật khẩu SMTP đang dùng (trang admin không hiện lại mật khẩu).
export const PUT = adminRoute(async (req, _ctx, user) => {
  const body = (await readJson(req)) as { pass?: string } | null;
  const current = await getEmailSettings();
  const parsed = CONFIG_SCHEMAS.email.safeParse({ ...(body ?? {}), pass: body?.pass || current.pass });
  if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '));
  const value = parsed.data;
  if (value.enabled && (!value.host || !value.user || !value.pass)) throw badRequest('Bật gửi email cần nhập đủ SMTP Host, Email SMTP và Mật khẩu');

  await prisma.systemConfig.upsert({
    where: { key: 'email' },
    update: { value: value as Prisma.InputJsonValue, updatedById: user.id },
    create: { key: 'email', value: value as Prisma.InputJsonValue, updatedById: user.id },
  });
  clearEmailCache();
  const mask = (v: typeof value) => ({ ...v, pass: v.pass ? '***' : '' });
  await writeAudit({ actorId: user.id, action: 'email.update', entity: 'SystemConfig', entityId: 'email', before: mask(current), after: mask(value), ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});
