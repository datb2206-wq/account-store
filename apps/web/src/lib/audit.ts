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

export function writeAudit(entry: AuditEntry, db: Prisma.TransactionClient = prisma) {
  return db.auditLog.create({
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
}
