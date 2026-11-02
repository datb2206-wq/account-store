import { prisma } from '@accszone/database';
import { getCurrentUser, STAFF_ROLES } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { readProof } from '@/lib/uploads';

// Ảnh biên lai: chỉ chủ yêu cầu nạp hoặc nhân viên được xem
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, 'Unauthorized');

  const { id } = await params;
  const t = await prisma.transaction.findUnique({ where: { id }, select: { userId: true, proofImageUrl: true } });
  if (!t || (t.userId !== user.id && !STAFF_ROLES.includes(user.role)) || !t.proofImageUrl) return jsonError(404, 'Not found');

  const file = await readProof(t.proofImageUrl);
  if (!file) return jsonError(404, 'Not found');
  return new Response(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.type,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
