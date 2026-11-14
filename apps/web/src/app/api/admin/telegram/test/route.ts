import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getTelegramSettings, sendTelegram } from '@accszone/core';
import { adminRoute, badRequest, parseBody } from '@/lib/admin-route';

// Gửi tin thử với token/chat ID đang nhập (token để trống = dùng token đã lưu)
export const POST = adminRoute(async (req) => {
  const input = await parseBody(req, z.object({ botToken: z.string().trim().max(200).default(''), chatId: z.string().trim().min(1, 'Nhập Chat ID').max(100) }));
  const token = input.botToken || (await getTelegramSettings()).botToken;
  if (!token) throw badRequest('Nhập Bot Token');
  try {
    await sendTelegram(token, input.chatId, '✅ Kết nối thành công! Web sẽ gửi thông báo đơn hàng, nạp tiền... vào đây.');
  } catch (err) {
    throw badRequest(`Telegram báo lỗi: ${err instanceof Error ? err.message : String(err)}`);
  }
  return NextResponse.json({ ok: true });
});
