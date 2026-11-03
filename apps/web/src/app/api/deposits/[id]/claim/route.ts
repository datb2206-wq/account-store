import { NextResponse } from 'next/server';
import { claimDeposit } from '@accszone/core';
import { badRequest, userRoute } from '@/lib/admin-route';
import { tooManyRequests } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { deleteProof, saveProof, UploadError } from '@/lib/uploads';

type Ctx = { params: Promise<{ id: string }> };

const MAX_REFERENCE = 100;

// Khách báo đã thanh toán (ngân hàng / USDT), multipart/form-data: "reference" (mã giao dịch / TxID) và/hoặc "proof" (ảnh biên lai)
export const POST = userRoute<Ctx>(async (req, { params }, user) => {
  const limit = await rateLimit(`deposit:claim:${user.id}`, 10, 10 * 60);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const { id } = await params;
  const form = await req.formData().catch(() => null);
  if (!form) throw badRequest('Invalid form data');
  const file = form.get('proof');
  const reference = String(form.get('reference') ?? '').trim();
  if (reference.length > MAX_REFERENCE) throw badRequest('Enter the transaction reference or upload a receipt');

  let proofKey: string | null = null;
  if (file instanceof File && file.size > 0) {
    try {
      proofKey = await saveProof(file);
    } catch (err) {
      if (err instanceof UploadError) throw badRequest(err.message);
      throw err;
    }
  }

  try {
    const { replacedProof } = await claimDeposit(user.id, id, proofKey, reference || null);
    await deleteProof(replacedProof);
  } catch (err) {
    await deleteProof(proofKey); // không gắn được vào yêu cầu nào -> xóa file vừa lưu
    throw err;
  }
  return NextResponse.json({ ok: true });
});
