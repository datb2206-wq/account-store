import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, 'Unauthorized');
  return NextResponse.json({ user: { ...user, balance: user.balance.toString() } });
}
