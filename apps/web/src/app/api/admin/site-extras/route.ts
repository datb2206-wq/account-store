import { NextResponse } from 'next/server';
import { CONFIG_SCHEMAS } from '@accszone/core';
import { prisma, type Prisma } from '@accszone/database';
import { adminRoute, badRequest } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp, readJson } from '@/lib/http';
import { getSiteExtras } from '@/lib/site-extras';

// Lưu Admin > Cài đặt website (màu, popup, trang nội dung, mã theo dõi, nút liên hệ, bảng xếp hạng)
export const PUT = adminRoute(async (req, _ctx, user) => {
  const parsed = CONFIG_SCHEMAS['site.extras'].safeParse(await readJson(req));
  if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '));
  const before = await getSiteExtras();
  const value = parsed.data as Prisma.InputJsonValue;
  await prisma.systemConfig.upsert({
    where: { key: 'site.extras' },
    update: { value, updatedById: user.id },
    create: { key: 'site.extras', value, description: 'Admin > Cài đặt website', updatedById: user.id },
  });
  // Nội dung trang dài: nhật ký chỉ ghi độ dài để không phình bảng audit
  const slim = (v: typeof before) => ({ ...v, pages: Object.fromEntries(Object.entries(v.pages).map(([k, p]) => [k, { title: p.title, chars: p.body.length }])) });
  await writeAudit({ actorId: user.id, action: 'site.extras', entity: 'SystemConfig', entityId: 'site.extras', before: slim(before), after: slim(parsed.data), ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});
