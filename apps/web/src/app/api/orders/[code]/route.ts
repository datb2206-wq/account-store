import { NextResponse, type NextRequest } from 'next/server';
import { getLocale } from '@/i18n/server';
import { getCurrentUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { getOrderForUser } from '@/lib/purchase';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, 'Unauthorized');

  const result = await getOrderForUser((await params).code, user.id, await getLocale());
  if (!result) return jsonError(404, 'Order not found');
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
