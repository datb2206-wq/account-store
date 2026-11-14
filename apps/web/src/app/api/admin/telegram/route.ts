import { NextResponse } from 'next/server';
import { clearTelegramCache, CONFIG_SCHEMAS, getTelegramSettings } from '@accszone/core';
import { prisma, type Prisma } from '@accszone/database';
import { adminRoute, badRequest } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp, readJson } from '@/lib/http';

// Lưu cấu hình Telegram. botToken để trống = giữ token đang dùng (trang admin không hiện lại token).
export const PUT = adminRoute(async (req, _ctx, user) => {
  const body = (await readJson(req)) as { botToken?: string } | null;
  const current = await getTelegramSettings();
  const parsed = CONFIG_SCHEMAS.telegram.safeParse({ ...(body ?? {}), botToken: body?.botToken?.trim() || current.botToken });
  if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '));
  const value = parsed.data;
  if (value.enabled && (!value.botToken || !value.chatId)) throw badRequest('Bật thông báo cần nhập đủ Bot Token và Chat ID');

  await prisma.systemConfig.upsert({
    where: { key: 'telegram' },
    update: { value: value as Prisma.InputJsonValue, updatedById: user.id },
    create: { key: 'telegram', value: value as Prisma.InputJsonValue, updatedById: user.id },
  });
  clearTelegramCache();
  const mask = (v: typeof value) => ({ ...v, botToken: v.botToken ? '***' : '' });
  await writeAudit({ actorId: user.id, action: 'telegram.update', entity: 'SystemConfig', entityId: 'telegram', before: mask(current), after: mask(value), ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});
