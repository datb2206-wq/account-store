import { notifyAuditLog } from '@accszone/core';
import { prisma, type Prisma } from '@accszone/database';

interface AuditEntry {
  actorId: string | null; // null = hệ thống (webhook, job)
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

// JSON round-trip: Decimal -> string, Date -> ISO string, bỏ undefined
const toJson = (v: unknown) =>
  v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

// Sau khi ghi: báo Telegram (admin thao tác / đăng nhập, thành viên mới). Chờ 1,5 giây để transaction kịp commit;
// transaction bị rollback thì không còn bản ghi -> không báo.
export async function writeAudit(entry: AuditEntry, db: Prisma.TransactionClient = prisma) {
  const row = await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      before: toJson(entry.before),
      after: toJson(entry.after),
      ip: entry.ip,
    },
  });
  setTimeout(() => void notifyAuditLog(row.id), 1_500).unref?.();
  return row;
}
