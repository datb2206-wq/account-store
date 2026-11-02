import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, type Prisma } from '@accszone/database';
import { adminRoute, badRequest, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { LOCALES } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { flatten, getOverrides, invalidateOverrides, MAX_TEXT, OVERRIDES_KEY, placeholders } from '@/lib/i18n-overrides';

const bodySchema = z.object({
  locale: z.enum(LOCALES),
  // Toàn bộ bản dịch tùy chỉnh của 1 ngôn ngữ (thay thế bản cũ). Chuỗi rỗng = dùng lại bản gốc.
  values: z.record(z.string(), z.string().max(MAX_TEXT, `Tối đa ${MAX_TEXT} ký tự`)),
});

// Lưu bản dịch tùy chỉnh của 1 ngôn ngữ (Admin > Bản dịch)
export const PUT = adminRoute(
  async (req, _ctx, user) => {
    const { locale, values } = await parseBody(req, bodySchema);
    const base = flatten(getDictionary(locale));
    const source = flatten(getDictionary('en'));

    const clean: Record<string, string> = {};
    const errors: string[] = [];
    for (const [key, raw] of Object.entries(values)) {
      const text = raw.trim();
      if (!(key in base)) {
        errors.push(`${key}: khóa không tồn tại`);
        continue;
      }
      if (!text || text === base[key]) continue; // trống / giống bản gốc -> không cần lưu
      const need = placeholders(source[key]!).join(' ');
      const got = placeholders(text).join(' ');
      if (need !== got) errors.push(`${key}: phải giữ đúng các biến ${need || '(không có biến)'}, đang có ${got || '(không có)'}`);
      else clean[key] = text;
    }
    if (errors.length) throw badRequest(errors.slice(0, 5).join(' · ') + (errors.length > 5 ? ` · …(+${errors.length - 5})` : ''));

    const before = await getOverrides(true);
    const next = { ...before, [locale]: clean };
    await prisma.systemConfig.upsert({
      where: { key: OVERRIDES_KEY },
      update: { value: next as Prisma.InputJsonValue, updatedById: user.id },
      create: { key: OVERRIDES_KEY, value: next as Prisma.InputJsonValue, updatedById: user.id, description: 'Bản dịch tùy chỉnh (Admin > Bản dịch)' },
    });
    invalidateOverrides();
    await writeAudit({
      actorId: user.id,
      action: 'translations.update',
      entity: 'SystemConfig',
      entityId: OVERRIDES_KEY,
      before: { locale, count: Object.keys(before[locale] ?? {}).length, values: before[locale] ?? {} },
      after: { locale, count: Object.keys(clean).length, values: clean },
      ip: getClientIp(req),
    });
    return NextResponse.json({ saved: Object.keys(clean).length });
  },
  { superAdminOnly: true },
);
