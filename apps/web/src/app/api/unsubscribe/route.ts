import { NextResponse, type NextRequest } from 'next/server';
import { verifyUnsubscribeToken } from '@accszone/core';
import { prisma } from '@accszone/database';
import { jsonError } from '@/lib/http';

// Hủy nhận email chiến dịch. POST từ nút xác nhận ở trang /unsubscribe, hoặc "1 click" của Gmail (List-Unsubscribe)
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const body = (await req.json().catch(() => null)) as { u?: string; t?: string } | null;
  const u = body?.u ?? url.searchParams.get('u') ?? '';
  const t = body?.t ?? url.searchParams.get('t') ?? '';
  if (!u || !t || !verifyUnsubscribeToken(u, t)) return jsonError(400, 'Invalid unsubscribe link');
  await prisma.user.updateMany({ where: { id: u }, data: { emailOptOut: true } });
  return NextResponse.json({ ok: true });
}
