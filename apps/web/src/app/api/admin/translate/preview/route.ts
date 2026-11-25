import { NextResponse } from 'next/server';
import { z } from 'zod';
import { previewTranslation, sampleProductIds } from '@accszone/core';
import { adminRoute, parseBody } from '@/lib/admin-route';

const schema = z.object({
  ids: z.array(z.string().min(1).max(50)).max(20).optional(), // trống = tự chọn ~10 sản phẩm mẫu
  locale: z.enum(['en', 'id', 'ru', 'zh', 'pt']).default('pt'),
});

// Dịch thử: gọi AI với cấu hình hiện tại nhưng KHÔNG ghi vào sản phẩm (để duyệt prompt trước khi chạy hàng loạt)
export const POST = adminRoute(async (req) => {
  const input = await parseBody(req, schema);
  const ids = input.ids?.length ? input.ids : await sampleProductIds();
  const items = await previewTranslation(ids, input.locale);
  return NextResponse.json({ items });
});

export const maxDuration = 300;
