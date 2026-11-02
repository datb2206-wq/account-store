import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { getOrderForUser } from '@/lib/purchase';

// Ô CSV: bọc ngoặc kép khi cần; ô bắt đầu bằng = + - @ bị Excel hiểu là công thức -> thêm ' phía trước
function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// Tải hàng đã mua: ?format=txt (mặc định, mỗi dòng 1 tài khoản) hoặc ?format=csv
// (tách các trường theo dấu "|", VD user|pass|cookie -> 3 cột; có BOM để Excel đọc đúng UTF-8)
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, 'Unauthorized');

  const result = await getOrderForUser((await params).code, user.id);
  if (!result) return jsonError(404, 'Order not found');

  const csv = req.nextUrl.searchParams.get('format') === 'csv';
  const body = csv
    ? '﻿' + result.items.map((line) => line.split('|').map(csvCell).join(',')).join('\r\n') + '\r\n'
    : result.items.join('\n') + '\n';

  return new Response(body, {
    headers: {
      'Content-Type': csv ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${result.order.code}.${csv ? 'csv' : 'txt'}"`,
      'Cache-Control': 'no-store',
    },
  });
}
