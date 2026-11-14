import { NextResponse } from 'next/server';
import { CONFIG_SCHEMAS, getCtvSettings } from '@accszone/core';
import { prisma, type Prisma } from '@accszone/database';
import { adminRoute, badRequest } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp, readJson } from '@/lib/http';

// Lưu cấu hình CTV
export const PUT = adminRoute(async (req, _ctx, user) => {
  const parsed = CONFIG_SCHEMAS.ctv.safeParse(await readJson(req));
  if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '));
  const before = await getCtvSettings();
  const value = parsed.data as Prisma.InputJsonValue;
  await prisma.systemConfig.upsert({ where: { key: 'ctv' }, update: { value, updatedById: user.id }, create: { key: 'ctv', value, updatedById: user.id } });
  await writeAudit({ actorId: user.id, action: 'ctv.settings', entity: 'SystemConfig', entityId: 'ctv', before, after: value, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});
