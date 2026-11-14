import { NextResponse, type NextRequest } from 'next/server';
import { handleCardCallback } from '@accszone/core';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

// Callback kết quả thẻ cào từ đối tác đổi thẻ. Đối tác gửi GET (query) hoặc POST (JSON / form) tùy web.
// Xác thực bằng callback_sign = md5(partner_key + code + serial) trong core.
async function readParams(req: NextRequest): Promise<Record<string, string>> {
  const out: Record<string, string> = Object.fromEntries(req.nextUrl.searchParams);
  if (req.method === 'POST') {
    const type = req.headers.get('content-type') ?? '';
    try {
      if (type.includes('json')) {
        for (const [k, v] of Object.entries((await req.json()) as Record<string, unknown>)) if (v != null) out[k] = String(v);
      } else {
        for (const [k, v] of (await req.formData()).entries()) if (typeof v === 'string') out[k] = v;
      }
    } catch {}
  }
  return out;
}

async function handle(req: NextRequest) {
  const p = await readParams(req);
  const result = await handleCardCallback(p);
  if (!result.ok) {
    await writeAudit({ actorId: null, action: 'card.callback.rejected', entity: 'Transaction', entityId: p.request_id?.slice(0, 50), after: { reason: result.reason, status: p.status }, ip: getClientIp(req) });
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export const GET = handle;
export const POST = handle;
