import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getTranslateSettings, parseFixRules } from '@accszone/core';
import { prisma, type Prisma } from '@accszone/database';
import { adminRoute, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { can } from '@/lib/permissions';
import { getClientIp } from '@/lib/http';

const schema = z.object({
  find: z.string().min(1).max(300),
  replace: z.string().max(300).default(''),
  field: z.enum(['name', 'description', 'both']).default('both'),
  matchCase: z.boolean().default(false),
  locale: z.enum(['en', 'id', 'ru', 'zh', 'pt']).default('pt'),
  apply: z.boolean().default(false), // false = chỉ xem trước
  lock: z.boolean().default(true), // khóa bản dịch sau khi sửa để "Dịch lại" / đồng bộ không ghi đè
  saveRule: z.boolean().default(false), // thêm vào "Quy tắc sửa tự động" để AI dịch sau này tự sửa
});

type Change = { id: string; field: 'name' | 'description'; before: string; after: string };

const asMap = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {});
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Dọn dấu gạch nối / khoảng trắng thừa khi xóa 1 cụm trong tên ("A - - B", "A - " ...)
const tidyName = (s: string) =>
  s
    .replace(/(\s*-\s*){2,}/g, ' - ')
    .replace(/^\s*-\s*|\s*-\s*$/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
const tidyText = (s: string) => s.replace(/[ \t]{2,}/g, ' ').replace(/ +\n/g, '\n').trim();

// Tìm & thay thế 1 cụm trong bản dịch (không dùng AI): chỉ đổi đúng cụm đó, phần còn lại giữ nguyên
export const POST = adminRoute(async (req, _ctx, user) => {
  const input = await parseBody(req, schema);
  const re = new RegExp(escapeRe(input.find), input.matchCase ? 'g' : 'gi');
  const fields = input.field === 'both' ? (['name', 'description'] as const) : ([input.field] as const);

  const products = await prisma.product.findMany({ select: { id: true, name: true, description: true } });
  const changes: Change[] = [];
  const updates = new Map<string, { name?: Record<string, string>; description?: Record<string, string> }>();
  for (const p of products) {
    for (const f of fields) {
      const m = asMap(p[f]);
      const before = m[input.locale];
      if (!before) continue;
      re.lastIndex = 0;
      if (!re.test(before)) continue;
      const replaced = before.replace(re, () => input.replace);
      const after = f === 'name' ? tidyName(replaced) : tidyText(replaced);
      if (after === before) continue;
      changes.push({ id: p.id, field: f, before, after });
      const u = updates.get(p.id) ?? {};
      u[f] = { ...m, [input.locale]: after };
      updates.set(p.id, u);
    }
  }

  if (!input.apply) {
    return NextResponse.json({ products: updates.size, changes: changes.length, items: changes.slice(0, 500) });
  }

  const byId = new Map(products.map((p) => [p.id, p]));
  const ops = [...updates].map(([id, u]) => {
    const name = u.name ?? asMap(byId.get(id)?.name);
    return prisma.product.update({
      where: { id },
      data: {
        name: input.lock ? { ...name, lock: '1' } : name,
        ...(u.description && { description: u.description }),
      },
    });
  });
  for (let i = 0; i < ops.length; i += 200) await prisma.$transaction(ops.slice(i, i + 200));

  // Lưu thành quy tắc sửa tự động (cần quyền sửa cấu hình)
  let ruleSaved = false;
  if (input.saveRule && can(user, 'settings.edit') && !input.find.includes('=>')) {
    const s = await getTranslateSettings();
    const current = s.fixRules?.[input.locale] ?? '';
    if (!parseFixRules(current).some((r) => r.find.toLowerCase() === input.find.trim().toLowerCase())) {
      const next = `${current.trimEnd()}${current.trim() ? String.fromCharCode(10) : ''}${input.find.trim()} => ${input.replace.trim()}`.slice(0, 8000);
      const value = { ...s, fixRules: { ...s.fixRules, [input.locale]: next } } as Prisma.InputJsonValue;
      await prisma.systemConfig.update({ where: { key: 'translate' }, data: { value, updatedById: user.id } });
    }
    ruleSaved = true;
  }

  await writeAudit({
    actorId: user.id,
    action: 'translate.replace',
    entity: 'Product',
    after: { find: input.find, replace: input.replace, field: input.field, locale: input.locale, products: updates.size, changes: changes.length, lock: input.lock, ruleSaved },
    ip: getClientIp(req),
  });
  return NextResponse.json({ products: updates.size, changes: changes.length, ruleSaved });
});
