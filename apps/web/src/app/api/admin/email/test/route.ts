import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEmailSettings, sendMail } from '@accszone/core';
import { adminRoute, badRequest, parseBody } from '@/lib/admin-route';

const schema = z.object({
  to: z.string().trim().email('Email nhận thử không hợp lệ'),
  host: z.string().trim().min(1, 'Nhập SMTP Host'),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.enum(['tls', 'ssl', 'none']),
  user: z.string().trim().min(1, 'Nhập Email SMTP'),
  pass: z.string().default(''),
  fromEmail: z.string().trim().default(''),
  fromName: z.string().trim().default(''),
});

// Gửi email thử với cấu hình đang nhập (mật khẩu để trống = dùng mật khẩu đã lưu)
export const POST = adminRoute(async (req) => {
  const input = await parseBody(req, schema);
  const saved = await getEmailSettings();
  const settings = { ...saved, ...input, pass: input.pass || saved.pass };
  if (!settings.pass) throw badRequest('Nhập mật khẩu SMTP');
  try {
    await sendMail({ to: input.to, subject: 'Email thử - kết nối SMTP thành công', html: '<p>✅ Kết nối SMTP thành công! Web có thể gửi email cho khách.</p>' }, { ...settings, enabled: true });
  } catch (err) {
    throw badRequest(`Gửi thất bại: ${err instanceof Error ? err.message : String(err)}`);
  }
  return NextResponse.json({ ok: true });
});
