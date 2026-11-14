import { NextResponse } from 'next/server';
import { CONFIG_SCHEMAS, getTranslateSettings } from '@accszone/core';
import { prisma, type Prisma } from '@accszone/database';
import { adminRoute, badRequest } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp, readJson } from '@/lib/http';

// Lưu cấu hình dịch. API key để trống = giữ key cũ (không bao giờ gửi key ra trình duyệt).
export const PUT = adminRoute(async (req, _ctx, user) => {
  const before = await getTranslateSettings();
  const raw = { ...((await readJson(req)) as object) } as { apiKey?: string; azureKey?: string };
  if (!raw.apiKey) raw.apiKey = before.apiKey;
  if (!raw.azureKey) raw.azureKey = before.azureKey;
  const parsed = CONFIG_SCHEMAS.translate.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '));
  const value = parsed.data as Prisma.InputJsonValue;
  await prisma.systemConfig.upsert({ where: { key: 'translate' }, update: { value, updatedById: user.id }, create: { key: 'translate', value, isSecret: true, updatedById: user.id } });
  const hide = (k: string) => (k ? `••••${k.slice(-4)}` : '');
  const mask = (v: typeof before) => ({ ...v, apiKey: hide(v.apiKey), azureKey: hide(v.azureKey) });
  await writeAudit({ actorId: user.id, action: 'translate.settings', entity: 'SystemConfig', entityId: 'translate', before: mask(before), after: mask(parsed.data), ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});
