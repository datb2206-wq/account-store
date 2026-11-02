import bcrypt from 'bcryptjs';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@accszone/database';
import { createSession, setAuthCookies } from '@/lib/auth';
import { getClientIp, jsonError, readJson, tooManyRequests } from '@/lib/http';
import { rateLimit, resetRateLimit } from '@/lib/rate-limit';
import { fieldErrors, loginSchema } from '@/lib/validation';

// Hash giả để so sánh khi email không tồn tại -> thời gian phản hồi như nhau,
// kẻ tấn công không dò được email nào đã đăng ký.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hash('timing-safe-dummy-password', 12));

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ipLimit = await rateLimit(`login:ip:${ip}`, 30, 15 * 60);
  if (!ipLimit.ok) return tooManyRequests(ipLimit.retryAfter);

  const parsed = loginSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return jsonError(400, 'Please check the highlighted fields', { fields: fieldErrors(parsed.error) });
  }
  const { email, password } = parsed.data;

  const emailKey = `login:email:${email}`;
  const emailLimit = await rateLimit(emailKey, 10, 15 * 60);
  if (!emailLimit.ok) return tooManyRequests(emailLimit.retryAfter);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, username: true, role: true, status: true, passwordHash: true },
  });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !valid) return jsonError(401, 'Invalid email or password');
  if (user.status === 'BANNED') return jsonError(403, 'This account has been suspended');

  await Promise.all([
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastLoginIp: ip } }),
    resetRateLimit(emailKey),
  ]);

  const { passwordHash: _, status: __, ...publicUser } = user;
  const res = NextResponse.json({ user: publicUser });
  setAuthCookies(res, await createSession(user));
  return res;
}
