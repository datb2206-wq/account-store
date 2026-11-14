import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { NextResponse, type NextRequest } from 'next/server';
import { attachReferrer, REF_COOKIE } from '@accszone/core';
import { prisma, type Prisma } from '@accszone/database';
import { writeAudit } from '@/lib/audit';
import { createSession, setAuthCookies } from '@/lib/auth';
import { getClientIp, jsonError, readJson, tooManyRequests } from '@/lib/http';
import { blockedIpResponse } from '@/lib/ip-block';
import { rateLimit } from '@/lib/rate-limit';
import { CAPTCHA_ERROR, captchaActive, getSecurity, verifyCaptcha } from '@/lib/security';
import { claimSession } from '@/lib/session-guard';
import { fieldErrors, registerSchema } from '@/lib/validation';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const blocked = await blockedIpResponse(ip);
  if (blocked) return blocked;
  const limit = await rateLimit(`register:ip:${ip}`, 5, 60 * 60);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const raw = (await readJson(req)) as Record<string, unknown> | null;
  const security = await getSecurity();
  if (captchaActive(security, 'register') && !(await verifyCaptcha(security.captcha.secretKey, raw?.captchaToken, ip))) {
    return jsonError(400, CAPTCHA_ERROR);
  }
  // Giới hạn tổng số tài khoản đăng ký từ 1 IP (0 = không giới hạn)
  if (security.maxAccountsPerIp > 0 && ip !== 'unknown' && (await prisma.user.count({ where: { registerIp: ip } })) >= security.maxAccountsPerIp) {
    return jsonError(429, 'Too many accounts registered from this IP address');
  }
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(400, 'Please check the highlighted fields', { fields: fieldErrors(parsed.error) });
  }
  const { email, password, username } = parsed.data;

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash: await bcrypt.hash(password, 12),
        lastLoginAt: new Date(),
        lastLoginIp: ip,
        registerIp: ip,
      },
      select: { id: true, email: true, username: true, role: true },
    });
  } catch (err) {
    // Không dùng instanceof: class lỗi của Prisma có thể bị nạp 2 bản (monorepo + bundler)
    const known = err as Partial<Prisma.PrismaClientKnownRequestError>;
    if (known?.code === 'P2002') {
      const field = String(known.meta?.target ?? '').includes('username') ? 'username' : 'email';
      return jsonError(409, `This ${field} is already registered`, {
        fields: { [field]: [`This ${field} is already registered`] },
      });
    }
    throw err;
  }

  // Người giới thiệu (cookie từ link /r/MÃ). Lỗi ở đây không được chặn đăng ký.
  await attachReferrer(user.id, req.cookies.get(REF_COOKIE)?.value).catch(() => null);

  // Nhật ký hoạt động (Admin > Lịch sử). Lỗi ghi log không được chặn việc đăng ký.
  await writeAudit({ actorId: user.id, action: 'auth.register', entity: 'User', entityId: user.id, after: { userAgent: req.headers.get('user-agent') }, ip }).catch(() => null);

  const res = NextResponse.json({ user }, { status: 201 });
  const sid = randomUUID();
  await claimSession(user.id, user.role, sid);
  setAuthCookies(res, await createSession(user, sid));
  return res;
}
