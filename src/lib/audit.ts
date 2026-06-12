import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

type JsonValue = Prisma.InputJsonValue | undefined;

export interface AuditInput {
  entityType: string;
  entityId: string;
  action: string;
  userId?: string | null;
  actorLabel?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Append an audit log entry. Everything material (status, ETA, FOB cost,
 * link/unlink) routes through here. Safe to call inside a transaction by
 * passing a tx client.
 */
export async function logAudit(
  input: AuditInput,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return client.auditLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      userId: input.userId ?? null,
      actorLabel: input.actorLabel ?? (input.userId ? null : "system"),
      before: (input.before ?? Prisma.JsonNull) as JsonValue as Prisma.InputJsonValue,
      after: (input.after ?? Prisma.JsonNull) as JsonValue as Prisma.InputJsonValue,
    },
  });
}

/** Shallow diff helper: returns only changed keys for compact audit records. */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    const bv = before[key];
    const av = after[key];
    if (String(bv) !== String(av)) {
      b[key] = bv;
      a[key] = av;
    }
  }
  return { before: b, after: a };
}
