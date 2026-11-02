import bcrypt from 'bcryptjs';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma, type Prisma } from '@accszone/database';
import { createSession, setAuthCookies } from '@/lib/auth';
import { getClientIp, jsonError, readJson, tooManyRequests } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { fieldErrors, registerSchema } from '@/lib/validation';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limit = await rateLimit(`register:ip:${ip}`, 5, 60 * 60);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const parsed = registerSchema.safeParse(await readJson(req));
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

  const res = NextResponse.json({ user }, { status: 201 });
  setAuthCookies(res, await createSession(user));
  return res;
}
