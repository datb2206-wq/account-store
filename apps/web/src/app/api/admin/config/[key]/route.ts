import { NextResponse } from 'next/server';
import { prisma, type Prisma } from '@accszone/database';
import { adminRoute, badRequest, notFound } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { CONFIG_SCHEMAS, isConfigKey } from '@accszone/core';
import { getClientIp, readJson } from '@/lib/http';

type Ctx = { params: Promise<{ key: string }> };

export const PUT = adminRoute<Ctx>(
  async (req, { params }, user) => {
    const { key } = await params;
    if (!isConfigKey(key)) throw notFound('Key cấu hình không tồn tại');

    const body = (await readJson(req)) as { value?: unknown } | null;
    const parsed = CONFIG_SCHEMAS[key].safeParse(body?.value);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(gốc)'}: ${i.message}`);
      throw badRequest(issues.join(' · '));
    }

    const before = await prisma.systemConfig.findUnique({ where: { key } });
    const value = parsed.data as Prisma.InputJsonValue;
    await prisma.systemConfig.upsert({
      where: { key },
      update: { value, updatedById: user.id },
      create: { key, value, updatedById: user.id },
    });
    await writeAudit({
      actorId: user.id,
      action: 'config.update',
      entity: 'SystemConfig',
      entityId: key,
      before: before?.value,
      after: value,
      ip: getClientIp(req),
    });
    return NextResponse.json({ value });
  },
  { superAdminOnly: true },
);
