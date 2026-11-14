import { NextResponse } from 'next/server';
import { stopTranslateJob } from '@accszone/core';
import { adminRoute } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

export const POST = adminRoute(async (req, _ctx, user) => {
  await stopTranslateJob();
  await writeAudit({ actorId: user.id, action: 'translate.stop', entity: 'SystemConfig', entityId: 'translate.job', ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});
