import { NextResponse, type NextRequest } from 'next/server';
import { handlePixCallback } from '@accszone/core';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

// Cổng PIX (7max) gọi lại khi khách trả xong: link do web tạo cho từng lệnh, ?ref=<mã bí mật của lệnh>.
// Cổng có thể gửi GET (query) hoặc POST (JSON / form).
async function readParams(req: NextRequest): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = Object.fromEntries(req.nextUrl.searchParams);
  delete out.ref;
  if (req.method === 'POST') {
    const type = req.headers.get('content-type') ?? '';
    try {
      if (type.includes('json')) Object.assign(out, (await req.json()) as Record<string, unknown>);
      else for (const [k, v] of (await req.formData()).entries()) if (typeof v === 'string') out[k] = v;
    } catch {}
  }
  return out;
}

async function handle(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref') ?? '';
  const payload = await readParams(req);
  const result = await handlePixCallback(ref, payload);
  if (!result.ok) {
    await writeAudit({ actorId: null, action: 'pix.callback.rejected', entity: 'Transaction', after: { reason: result.reason }, ip: getClientIp(req) });
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export const GET = handle;
export const POST = handle;
