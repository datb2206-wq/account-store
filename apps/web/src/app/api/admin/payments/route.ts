import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CONFIG_SCHEMAS, getCardSettings, getManualMethods } from '@accszone/core';
import { prisma, type Prisma } from '@accszone/database';
import { adminRoute, badRequest } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp, readJson } from '@/lib/http';

const issues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ');

async function save(key: 'payment.card' | 'payment.manual', value: unknown, userId: string) {
  await prisma.systemConfig.upsert({
    where: { key },
    update: { value: value as Prisma.InputJsonValue, updatedById: userId },
    create: { key, value: value as Prisma.InputJsonValue, isSecret: key === 'payment.card', updatedById: userId },
  });
}

// Lưu cấu hình cổng nạp: { card?: ..., manual?: [...] }
export const PUT = adminRoute(async (req, _ctx, user) => {
  const body = (await readJson(req)) as { card?: unknown; manual?: unknown } | null;
  const ip = getClientIp(req);
  if (body?.card !== undefined) {
    const before = await getCardSettings();
    const raw = { ...(body.card as object) } as { partnerKey?: string };
    // Để trống = giữ partner key cũ (không bao giờ gửi key ra trình duyệt)
    if (!raw.partnerKey) raw.partnerKey = before.partnerKey;
    const parsed = CONFIG_SCHEMAS['payment.card'].safeParse(raw);
    if (!parsed.success) throw badRequest(issues(parsed.error));
    if (parsed.data.enabled && (!parsed.data.apiUrl || !parsed.data.partnerId || !parsed.data.partnerKey)) {
      throw badRequest('Bật thẻ cào cần đủ URL đối tác, Partner ID và Partner Key');
    }
    await save('payment.card', parsed.data, user.id);
    const mask = (v: typeof before) => ({ ...v, partnerKey: v.partnerKey ? '••••' : '' });
    await writeAudit({ actorId: user.id, action: 'payment.card', entity: 'SystemConfig', entityId: 'payment.card', before: mask(before), after: mask(parsed.data), ip });
  }
  if (body?.manual !== undefined) {
    const parsed = CONFIG_SCHEMAS['payment.manual'].safeParse(body.manual);
    if (!parsed.success) throw badRequest(issues(parsed.error));
    const before = await getManualMethods();
    await save('payment.manual', parsed.data, user.id);
    await writeAudit({ actorId: user.id, action: 'payment.manual', entity: 'SystemConfig', entityId: 'payment.manual', before, after: parsed.data, ip });
  }
  return NextResponse.json({ ok: true });
});
