import { NextResponse } from 'next/server';
import { CONFIG_SCHEMAS } from '@accszone/core';
import { prisma, type Prisma } from '@accszone/database';
import { adminRoute, badRequest } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp, readJson } from '@/lib/http';
import { clearLanguageCache, getLanguages } from '@/lib/languages';

// Bật / tắt ngôn ngữ cho khách + chọn ngôn ngữ mặc định (Admin > Ngôn ngữ)
export const PUT = adminRoute(async (req, _ctx, user) => {
  const parsed = CONFIG_SCHEMAS['site.languages'].safeParse(await readJson(req));
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ');
  const before = await getLanguages();
  const value = { ...parsed.data, enabled: [...new Set(parsed.data.enabled)] };
  await prisma.systemConfig.upsert({
    where: { key: 'site.languages' },
    update: { value: value as Prisma.InputJsonValue, updatedById: user.id },
    create: { key: 'site.languages', value: value as Prisma.InputJsonValue, updatedById: user.id },
  });
  clearLanguageCache();
  await writeAudit({ actorId: user.id, action: 'languages.update', entity: 'SystemConfig', entityId: 'site.languages', before, after: value, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});
