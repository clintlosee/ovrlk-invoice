import { and, desc, eq } from "drizzle-orm";
import type { AppDb } from "../db/client";
import { auditLog, business, member, type OWNER_ROLE } from "../db/schema";
import { assertTimeZone } from "../lib/config";
import { type Cents, cents } from "../lib/money";

type MemberRole = typeof OWNER_ROLE;

export type AuditInput = {
  action: string;
  actorUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  amountCents?: Cents | number | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
};

const secretKeys = new Set([
  "password",
  "otp",
  "code",
  "secret",
  "token",
  "authorization",
]);

function metadataJson(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata) return null;
  for (const key of Object.keys(metadata)) {
    if (secretKeys.has(key.toLowerCase())) {
      throw new Error("Audit metadata cannot include secrets");
    }
  }
  return JSON.stringify(metadata);
}

/**
 * Every tenant read and write goes through here. The Business id is fixed by
 * the signed-in session; callers cannot pass a different one.
 */
export function forBusiness(db: AppDb, businessId: string) {
  if (!businessId) throw new Error("A signed-in Business is required");
  const scoped = eq(business.id, businessId);

  return {
    business: {
      async get() {
        const rows = await db.select().from(business).where(scoped).limit(1);
        return rows[0] ?? null;
      },
      async update(patch: { name?: string; timeZone?: string }) {
        const next: { name?: string; timeZone?: string; updatedAt: Date } = {
          updatedAt: new Date(),
        };
        if (patch.name !== undefined) next.name = patch.name;
        if (patch.timeZone !== undefined)
          next.timeZone = assertTimeZone(patch.timeZone);
        const rows = await db
          .update(business)
          .set(next)
          .where(scoped)
          .returning();
        return rows[0] ?? null;
      },
    },
    members: {
      async list() {
        return db
          .select()
          .from(member)
          .where(eq(member.businessId, businessId));
      },
      async get(memberId: string) {
        const rows = await db
          .select()
          .from(member)
          .where(
            and(eq(member.id, memberId), eq(member.businessId, businessId)),
          )
          .limit(1);
        return rows[0] ?? null;
      },
      async update(memberId: string, patch: { role: MemberRole }) {
        const rows = await db
          .update(member)
          .set(patch)
          .where(
            and(eq(member.id, memberId), eq(member.businessId, businessId)),
          )
          .returning({ id: member.id });
        return rows.length;
      },
    },
    audit: {
      async list() {
        return db
          .select()
          .from(auditLog)
          .where(eq(auditLog.businessId, businessId))
          .orderBy(desc(auditLog.createdAt));
      },
      async record(input: AuditInput) {
        const amount =
          input.amountCents == null ? null : cents(input.amountCents);
        const rows = await db
          .insert(auditLog)
          .values({
            id: crypto.randomUUID(),
            businessId,
            actorUserId: input.actorUserId ?? null,
            action: input.action,
            entityType: input.entityType ?? null,
            entityId: input.entityId ?? null,
            amountCents: amount,
            metadata: metadataJson(input.metadata),
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            createdAt: new Date(),
          })
          .returning();
        return rows[0];
      },
    },
  };
}

export async function recordAudit(
  db: AppDb,
  input: AuditInput & { businessId?: string | null },
) {
  if (input.businessId)
    return forBusiness(db, input.businessId).audit.record(input);
  const amount = input.amountCents == null ? null : cents(input.amountCents);
  const rows = await db
    .insert(auditLog)
    .values({
      id: crypto.randomUUID(),
      businessId: null,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      amountCents: amount,
      metadata: metadataJson(input.metadata),
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: new Date(),
    })
    .returning();
  return rows[0];
}
