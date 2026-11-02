// Wrapper cho Route Handler của Admin API: kiểm tra quyền, origin, parse body, map lỗi Prisma.
import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { DomainError } from '@accszone/core';
import type { Prisma } from '@accszone/database';
import { getCurrentUser, STAFF_ROLES, type CurrentUser } from './auth';
import { blockedByMaintenance, MAINTENANCE_ERROR } from './site';
import { isSameOrigin, jsonError, readJson } from './http';
import { fieldErrors } from './validation';

// Ném ra trong handler để trả response lỗi ngay (khỏi phải if/return lồng nhau)
export class ApiError extends Error {
  constructor(public response: Response) {
    super('ApiError');
  }
}

export const apiError = (status: number, error: string) => new ApiError(jsonError(status, error));
export const badRequest =(error: string, fields?: Record<string, string[] | undefined>) =>
  new ApiError(jsonError(400, error, fields ? { fields } : undefined));
export const notFound = (error = 'Không tìm thấy dữ liệu') => new ApiError(jsonError(404, error));
export const conflict = (error: string) => new ApiError(jsonError(409, error));

export async function parseBody<T extends z.ZodTypeAny>(
  req: NextRequest,
  schema: T,
  message = 'Vui lòng kiểm tra lại các trường bị lỗi',
): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) throw badRequest(message, fieldErrors(parsed.error));
  return parsed.data;
}

type RouteContext = { params: Promise<Record<string, string>> };
type Handler<C> = (req: NextRequest, ctx: C, user: CurrentUser) => Promise<Response>;

type Access = 'user' | 'staff' | 'superAdmin';

function guardedRoute<C extends RouteContext>(handler: Handler<C>, access: Access) {
  return async (req: NextRequest, ctx: C) => {
    if (req.method !== 'GET' && !isSameOrigin(req)) return jsonError(403, 'Invalid origin');

    const user = await getCurrentUser();
    if (!user) return jsonError(401, 'Unauthorized');
    const allowed =
      access === 'user' ||
      (access === 'staff' && STAFF_ROLES.includes(user.role)) ||
      (access === 'superAdmin' && user.role === 'SUPER_ADMIN');
    if (!allowed) return jsonError(403, 'Bạn không có quyền thực hiện thao tác này');
    if (access === 'user' && (await blockedByMaintenance(user))) return jsonError(503, MAINTENANCE_ERROR);

    try {
      return await handler(req, ctx, user);
    } catch (err) {
      if (err instanceof ApiError) return err.response;
      if (DomainError.is(err)) return jsonError(err.status, err.message);
      const mapped = mapPrismaError(err);
      if (mapped) return mapped;
      throw err;
    }
  };
}

export function adminRoute<C extends RouteContext = RouteContext>(
  handler: Handler<C>,
  opts: { superAdminOnly?: boolean } = {},
) {
  return guardedRoute(handler, opts.superAdminOnly ? 'superAdmin' : 'staff');
}

// Route cho khách đã đăng nhập (dùng chung cơ chế origin check + map lỗi)
export function userRoute<C extends RouteContext = RouteContext>(handler: Handler<C>) {
  return guardedRoute(handler, 'user');
}

function mapPrismaError(err: unknown) {
  // Không dùng instanceof: class lỗi của Prisma có thể bị nạp 2 bản (monorepo + bundler)
  const e = err as Partial<Prisma.PrismaClientKnownRequestError>;
  switch (e?.code) {
    case 'P2002': {
      const target = String(e.meta?.target ?? '');
      if (target.includes('slug')) return jsonError(409, 'Slug đã tồn tại', { fields: { slug: ['Slug đã tồn tại'] } });
      if (target.includes('bankRef')) return jsonError(409, 'Mã giao dịch ngân hàng này đã được ghi nhận cho một yêu cầu nạp khác');
      if (target.includes('txHash')) return jsonError(409, 'TxID này đã được ghi nhận cho một yêu cầu nạp khác');
      return jsonError(409, 'Dữ liệu bị trùng');
    }
    case 'P2003':
      return jsonError(409, 'Không thể thực hiện vì dữ liệu đang được sử dụng ở nơi khác');
    case 'P2025':
      return jsonError(404, 'Không tìm thấy dữ liệu');
    default:
      return null;
  }
}
