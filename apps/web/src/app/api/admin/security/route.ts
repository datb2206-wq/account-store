import { NextResponse } from 'next/server';
import { CONFIG_SCHEMAS } from '@accszone/core';
import { prisma, type Prisma } from '@accszone/database';
import { adminRoute, badRequest } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp, readJson } from '@/lib/http';
import { clearSecurityCache, getSecurity } from '@/lib/security';

// Lưu cài đặt bảo mật. captcha.secretKey để trống = giữ khóa đang dùng (trang admin không bao giờ hiện lại khóa).
export const PUT = adminRoute(async (req, _ctx, user) => {
  const body = (await readJson(req)) as { captcha?: { secretKey?: string } } | null;
  const current = await getSecurity();
  const merged = {
    ...(body ?? {}),
    captcha: { ...(body?.captcha ?? {}), secretKey: body?.captcha?.secretKey?.trim() || current.captcha.secretKey },
  };
  const parsed = CONFIG_SCHEMAS.security.safeParse(merged);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '));
  }
  const value = parsed.data;
  if (value.captcha.enabled && (!value.captcha.siteKey || !value.captcha.secretKey)) {
    throw badRequest('Bật Captcha cần nhập đủ Site Key và Secret Key');
  }

  await prisma.systemConfig.upsert({
    where: { key: 'security' },
    update: { value: value as Prisma.InputJsonValue, updatedById: user.id },
    create: { key: 'security', value: value as Prisma.InputJsonValue, updatedById: user.id },
  });
  clearSecurityCache();
  // Không ghi Secret Key vào nhật ký
  const mask = (v: typeof value) => ({ ...v, captcha: { ...v.captcha, secretKey: v.captcha.secretKey ? '***' : '' } });
  await writeAudit({ actorId: user.id, action: 'security.update', entity: 'SystemConfig', entityId: 'security', before: mask(current), after: mask(value), ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});
