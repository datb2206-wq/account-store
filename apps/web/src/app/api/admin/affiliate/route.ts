import { NextResponse } from 'next/server';
import { CONFIG_SCHEMAS, getAffiliateSettings } from '@accszone/core';
import { prisma, type Prisma } from '@accszone/database';
import { adminRoute, badRequest } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp, readJson } from '@/lib/http';

// Lưu cấu hình Affiliate
export const PUT = adminRoute(async (req, _ctx, user) => {
  const parsed = CONFIG_SCHEMAS.affiliate.safeParse(await readJson(req));
  if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '));
  const before = await getAffiliateSettings();
  const value = parsed.data as Prisma.InputJsonValue;
  await prisma.systemConfig.upsert({
    where: { key: 'affiliate' },
    update: { value, updatedById: user.id },
    create: { key: 'affiliate', value, updatedById: user.id },
  });
  await writeAudit({ actorId: user.id, action: 'affiliate.settings', entity: 'SystemConfig', entityId: 'affiliate', before, after: value, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});
