import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CONFIG_SCHEMAS, getConfig } from '@accszone/core';
import { prisma, type Prisma } from '@accszone/database';
import { adminRoute, badRequest, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { clearCurrencyCache } from '@/lib/fx';
import { getClientIp } from '@/lib/http';

const schema = z.object({
  defaultCurrency: z.string().trim().toUpperCase(),
  currencies: z
    .array(
      z.object({
        code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Mã tiền tệ gồm 3 chữ cái (VD VND)'),
        name: z.string().trim().min(1, 'Nhập tên tiền tệ').max(50),
        rate: z.coerce.number().positive('Tỷ giá phải lớn hơn 0'),
        decimals: z.coerce.number().int().min(0).max(8),
        enabled: z.boolean(),
        vndPer: z.union([z.literal(''), z.null(), z.coerce.number().positive('Số VND phải lớn hơn 0')]).optional(),
      }),
    )
    .min(1)
    .max(50),
});

// Lưu cùng lúc tỷ giá (currency.rates) và cấu hình hiển thị (currency.display)
export const PUT = adminRoute(async (req, _ctx, user) => {
  const input = await parseBody(req, schema);
  const codes = input.currencies.map((c) => c.code);
  const dup = codes.find((c, i) => codes.indexOf(c) !== i);
  if (dup) throw badRequest(`Mã tiền tệ ${dup} bị trùng`);
  if (!codes.includes('USD')) throw badRequest('Phải giữ USD (tiền gốc của hệ thống)');

  // Tiền tính theo VND: tỷ giá = tỷ giá VND / số VND của 1 đơn vị (VD VND 25400, 1 R$ = 5000 ₫ -> BRL 5.08)
  const vndRate = input.currencies.find((c) => c.code === 'VND')?.rate;
  const per = (c: (typeof input.currencies)[number]) => (typeof c.vndPer === 'number' && c.code !== 'VND' && c.code !== 'USD' ? c.vndPer : undefined);
  if (input.currencies.some((c) => per(c)) && !vndRate) throw badRequest('Cần có tỷ giá VND để tính tiền tệ theo VND');
  const rates = Object.fromEntries(
    input.currencies.map((c) => [c.code, c.code === 'USD' ? 1 : per(c) ? Number((vndRate! / per(c)!).toPrecision(8)) : c.rate]),
  );
  const display = {
    defaultCurrency: input.defaultCurrency === 'AUTO' || codes.includes(input.defaultCurrency) ? input.defaultCurrency : 'AUTO',
    currencies: input.currencies.map((c) => ({ code: c.code, name: c.name, decimals: c.decimals, enabled: c.code === 'USD' ? true : c.enabled, ...(per(c) ? { vndPer: per(c) } : {}) })),
  };

  // Tài khoản ngân hàng nhận nạp cần tỷ giá của tiền tệ đó để quy đổi sang USD
  const banks = await getConfig('bank.accounts').catch(() => []);
  const missing = [...new Set(banks.map((b) => b.currency))].filter((c) => !(c in rates));
  if (missing.length) throw badRequest(`Không xóa được ${missing.join(', ')}: đang dùng cho tài khoản ngân hàng nhận nạp (Cài đặt)`);

  const ratesValue = CONFIG_SCHEMAS['currency.rates'].parse(rates) as Prisma.InputJsonValue;
  const displayValue = CONFIG_SCHEMAS['currency.display'].parse(display) as Prisma.InputJsonValue;
  const before = await prisma.systemConfig.findMany({ where: { key: { in: ['currency.rates', 'currency.display'] } } });
  await prisma.$transaction([
    prisma.systemConfig.upsert({ where: { key: 'currency.rates' }, update: { value: ratesValue, updatedById: user.id }, create: { key: 'currency.rates', value: ratesValue, updatedById: user.id } }),
    prisma.systemConfig.upsert({ where: { key: 'currency.display' }, update: { value: displayValue, updatedById: user.id }, create: { key: 'currency.display', value: displayValue, updatedById: user.id } }),
  ]);
  clearCurrencyCache();
  await writeAudit({
    actorId: user.id,
    action: 'currency.update',
    entity: 'SystemConfig',
    entityId: 'currency',
    before: Object.fromEntries(before.map((r) => [r.key, r.value])),
    after: { rates, display },
    ip: getClientIp(req),
  });
  return NextResponse.json({ ok: true });
});
