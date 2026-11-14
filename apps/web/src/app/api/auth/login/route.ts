import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { after, NextResponse, type NextRequest } from 'next/server';
import { emailLoginAlert } from '@accszone/core';
import { prisma } from '@accszone/database';
import { writeAudit } from '@/lib/audit';
import { createSession, setAuthCookies } from '@/lib/auth';
import { getClientIp, jsonError, readJson, tooManyRequests } from '@/lib/http';
import { blockedIpResponse, recordFailedLogin } from '@/lib/ip-block';
import { rateLimit, resetRateLimit } from '@/lib/rate-limit';
import { CAPTCHA_ERROR, captchaActive, getSecurity, verifyCaptcha } from '@/lib/security';
import { claimSession } from '@/lib/session-guard';
import { fieldErrors, loginSchema } from '@/lib/validation';

// Hash giả để so sánh khi email không tồn tại -> thời gian phản hồi như nhau,
// kẻ tấn công không dò được email nào đã đăng ký.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hash('timing-safe-dummy-password', 12));

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const blocked = await blockedIpResponse(ip);
  if (blocked) return blocked;
  const ipLimit = await rateLimit(`login:ip:${ip}`, 30, 15 * 60);
  if (!ipLimit.ok) return tooManyRequests(ipLimit.retryAfter);

  const raw = (await readJson(req)) as Record<string, unknown> | null;
  const security = await getSecurity();
  if (captchaActive(security, 'login') && !(await verifyCaptcha(security.captcha.secretKey, raw?.captchaToken, ip))) {
    return jsonError(400, CAPTCHA_ERROR);
  }
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(400, 'Please check the highlighted fields', { fields: fieldErrors(parsed.error) });
  }
  const { email, password } = parsed.data;

  const emailKey = `login:email:${email}`;
  // Sai mật khẩu quá N lần vào 1 tài khoản -> tạm khóa đăng nhập tài khoản đó 15 phút (N: Admin > Bảo mật)
  const emailLimit = await rateLimit(emailKey, security.loginFailAccountLimit, 15 * 60);
  if (!emailLimit.ok) return tooManyRequests(emailLimit.retryAfter);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, username: true, role: true, status: true, passwordHash: true },
  });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));
  const userAgent = req.headers.get('user-agent');
  if (!user || !valid) {
    // Chỉ ghi khi email có thật: sai mật khẩu nhiều lần là dấu hiệu bị dò mật khẩu
    // Sai quá nhiều lần từ cùng 1 IP (kể cả dò email không tồn tại) -> tự chặn IP
    await recordFailedLogin(ip).catch((err) => console.error('auto block ip failed', err));
    if (user) await writeAudit({ actorId: user.id, action: 'auth.login_failed', entity: 'User', entityId: user.id, after: { userAgent }, ip }).catch(() => null);
    return jsonError(401, 'Invalid email or password');
  }
  if (user.status === 'BANNED') return jsonError(403, 'This account has been suspended');

  await Promise.all([
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastLoginIp: ip } }),
    resetRateLimit(emailKey),
    writeAudit({ actorId: user.id, action: 'auth.login', entity: 'User', entityId: user.id, after: { userAgent }, ip }).catch(() => null),
  ]);

  const { passwordHash: _, status: __, ...publicUser } = user;
  const res = NextResponse.json({ user: publicUser });
  // Email cảnh báo đăng nhập (nếu admin bật), gửi sau khi đã trả kết quả
  after(() => emailLoginAlert(user, ip, userAgent ?? ''));
  const sid = randomUUID();
  await claimSession(user.id, user.role, sid);
  setAuthCookies(res, await createSession(user, sid));
  return res;
}
