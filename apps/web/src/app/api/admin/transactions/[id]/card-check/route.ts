import { NextResponse } from 'next/server';
import { checkCard } from '@accszone/core';
import { adminRoute } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

// Hỏi lại đối tác đổi thẻ kết quả 1 thẻ đang chờ (khi chưa nhận được callback)
export const POST = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  let result: { status: string };
  try {
    result = await checkCard(id);
  } catch (err) {
    if ((err as { isDomainError?: boolean }).isDomainError) throw err;
    return NextResponse.json({ error: 'Không kết nối được đối tác đổi thẻ' }, { status: 502 });
  }
  await writeAudit({ actorId: user.id, action: 'card.check', entity: 'Transaction', entityId: id, after: result, ip: getClientIp(req) });
  return NextResponse.json(result);
});
