import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CONFIG_SCHEMAS, getCardSettings, getManualMethods, getPixSettings } from '@accszone/core';
import { prisma, type Prisma } from '@accszone/database';
import { adminRoute, badRequest } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp, readJson } from '@/lib/http';

const issues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ');

async function save(key: 'payment.card' | 'payment.manual' | 'payment.pix', value: unknown, userId: string) {
  await prisma.systemConfig.upsert({
    where: { key },
    update: { value: value as Prisma.InputJsonValue, updatedById: userId },
    create: { key, value: value as Prisma.InputJsonValue, isSecret: key !== 'payment.manual', updatedById: userId },
  });
}

// Lưu cấu hình cổng nạp: { card?: ..., manual?: [...] }
export const PUT = adminRoute(async (req, _ctx, user) => {
  const body = (await readJson(req)) as { card?: unknown; manual?: unknown; pix?: unknown } | null;
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
  if (body?.pix !== undefined) {
    const before = await getPixSettings();
    const raw = { ...(body.pix as object) } as { createUrl?: string; statusUrl?: string | null };
    // Để trống = giữ link cũ (không gửi link ra trình duyệt); statusUrl = null -> xóa
    if (!raw.createUrl) raw.createUrl = before.createUrl;
    raw.statusUrl = raw.statusUrl === null ? '' : raw.statusUrl || before.statusUrl;
    const parsed = CONFIG_SCHEMAS['payment.pix'].safeParse(raw);
    if (!parsed.success) throw badRequest(issues(parsed.error));
    if (parsed.data.enabled && !parsed.data.createUrl) throw badRequest('Bật PIX cần nhập link tạo lệnh nạp');
    if (parsed.data.maxAmount > 0 && parsed.data.maxAmount < parsed.data.minAmount) throw badRequest('Nạp tối đa phải lớn hơn nạp tối thiểu');
    await save('payment.pix', parsed.data, user.id);
    const mask = (v: typeof before) => ({ ...v, createUrl: v.createUrl ? '••••' : '', statusUrl: v.statusUrl ? '••••' : '' });
    await writeAudit({ actorId: user.id, action: 'payment.pix', entity: 'SystemConfig', entityId: 'payment.pix', before: mask(before), after: mask(parsed.data), ip });
  }
  return NextResponse.json({ ok: true });
});
