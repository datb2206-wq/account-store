import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { regenerateApiKey } from '@/lib/api-keys';
import { writeAudit } from '@/lib/audit';
import { getClientIp, isSameOrigin, jsonError } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';

// POST: tạo API key mới (key cũ hết hiệu lực ngay)
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, 'Invalid origin');
  const user = await getCurrentUser();
  if (!user) return jsonError(401, 'Unauthorized');
  const limit = await rateLimit(`apikey:regen:${user.id}`, 10, 3600);
  if (!limit.ok) return jsonError(429, 'Too many requests');
  const key = await regenerateApiKey(user.id);
  await writeAudit({ actorId: user.id, action: 'user.apiKey.regenerate', entity: 'User', entityId: user.id, ip: getClientIp(req) });
  return NextResponse.json({ key }, { headers: { 'Cache-Control': 'no-store' } });
}
