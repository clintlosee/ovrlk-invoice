import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { AppDb } from "../db/client";
import {
  auditLog,
  business,
  client,
  item,
  itemTaxRate,
  member,
  type OWNER_ROLE,
  taxRate,
} from "../db/schema";
import { assertTimeZone } from "../lib/config";
import { keyOwnedBy } from "../lib/files";
import { type Cents, cents } from "../lib/money";
import { categoryMethods, expenseMethods } from "./expense-store";
import { invoiceMethods } from "./invoice-store";
import { paymentMethods } from "./payment-store";

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

export type ClientInput = {
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  taxExempt: boolean;
  note: string | null;
};

export type TaxRateInput = {
  name: string;
  rateBps: number;
};

export type ItemInput = {
  name: string;
  description: string | null;
  unitPriceCents: number;
  taxRateIds: string[];
};

export type SavedTaxRate = {
  id: string;
  name: string;
  rateBps: number;
};

const MAX_RATE_BPS = 10_000;

function assertRateBps(rateBps: number) {
  if (!Number.isSafeInteger(rateBps) || rateBps < 0 || rateBps > MAX_RATE_BPS) {
    throw new Error(
      "Tax Rate must be an integer number of basis points from 0 to 10000",
    );
  }
}

async function ownedTaxRateIds(db: AppDb, businessId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return unique;
  const rows = await db
    .select({ id: taxRate.id })
    .from(taxRate)
    .where(
      and(eq(taxRate.businessId, businessId), inArray(taxRate.id, unique)),
    );
  if (rows.length !== unique.length) {
    throw new Error("Tax Rate does not belong to this Business");
  }
  return unique;
}

async function ratesByItem(db: AppDb, businessId: string, itemIds: string[]) {
  const grouped = new Map<string, SavedTaxRate[]>();
  if (itemIds.length === 0) return grouped;
  const links = await db
    .select({
      itemId: itemTaxRate.itemId,
      id: taxRate.id,
      name: taxRate.name,
      rateBps: taxRate.rateBps,
    })
    .from(itemTaxRate)
    .innerJoin(
      taxRate,
      and(
        eq(taxRate.id, itemTaxRate.taxRateId),
        eq(taxRate.businessId, businessId),
      ),
    )
    .where(
      and(
        eq(itemTaxRate.businessId, businessId),
        inArray(itemTaxRate.itemId, itemIds),
      ),
    );
  for (const link of links) {
    const list = grouped.get(link.itemId) ?? [];
    list.push({ id: link.id, name: link.name, rateBps: link.rateBps });
    grouped.set(link.itemId, list);
  }
  for (const list of grouped.values()) {
    list.sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
  }
  return grouped;
}

async function replaceItemTaxRates(
  executor: Pick<AppDb, "delete" | "insert">,
  businessId: string,
  itemId: string,
  taxRateIds: string[],
) {
  await executor
    .delete(itemTaxRate)
    .where(
      and(
        eq(itemTaxRate.itemId, itemId),
        eq(itemTaxRate.businessId, businessId),
      ),
    );
  if (taxRateIds.length === 0) return;
  await executor.insert(itemTaxRate).values(
    taxRateIds.map((taxRateId) => ({
      itemId,
      taxRateId,
      businessId,
    })),
  );
}

const secretKeys = new Set([
  "password",
  "otp",
  "code",
  "secret",
  "token",
  "authorization",
]);

function boundedText(
  value: string | null,
  max: number,
  label: string,
): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new Error(`${label} is too long`);
  return trimmed;
}

function accentOrNull(value: string | null): string | null {
  if (value === null || value.trim() === "") return null;
  const color = value.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) {
    throw new Error("Accent color must look like #1c1917");
  }
  return color;
}

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
      async update(patch: {
        name?: string;
        timeZone?: string;
        address?: string | null;
        taxId?: string | null;
        defaultTerms?: string | null;
        footer?: string | null;
        accentColor?: string | null;
      }) {
        const next: {
          name?: string;
          timeZone?: string;
          address?: string | null;
          taxId?: string | null;
          defaultTerms?: string | null;
          footer?: string | null;
          accentColor?: string | null;
          updatedAt: Date;
        } = { updatedAt: new Date() };
        if (patch.name !== undefined) {
          const name = patch.name.trim();
          if (!name || name.length > 200) {
            throw new Error("Business name is required");
          }
          next.name = name;
        }
        if (patch.timeZone !== undefined) {
          next.timeZone = assertTimeZone(patch.timeZone);
        }
        if (patch.address !== undefined) {
          next.address = boundedText(patch.address, 500, "Address");
        }
        if (patch.taxId !== undefined) {
          next.taxId = boundedText(patch.taxId, 40, "Tax ID");
        }
        if (patch.defaultTerms !== undefined) {
          next.defaultTerms = boundedText(patch.defaultTerms, 4000, "Terms");
        }
        if (patch.footer !== undefined) {
          next.footer = boundedText(patch.footer, 500, "Footer");
        }
        if (patch.accentColor !== undefined) {
          next.accentColor = accentOrNull(patch.accentColor);
        }
        const rows = await db
          .update(business)
          .set(next)
          .where(scoped)
          .returning();
        return rows[0] ?? null;
      },
      async setConnectedAccount(
        input: {
          accountId: string;
          chargesEnabled: boolean;
          detailsSubmitted: boolean;
          method?: "account_link" | "oauth";
        } | null,
      ) {
        if (input && !/^acct_[A-Za-z0-9_]{1,255}$/.test(input.accountId)) {
          throw new Error("Connected Account id is not valid");
        }
        const rows = await db
          .update(business)
          .set(
            input
              ? {
                  stripeAccountId: input.accountId,
                  stripeChargesEnabled: input.chargesEnabled,
                  stripeDetailsSubmitted: input.detailsSubmitted,
                  ...(input.method
                    ? { stripeConnectMethod: input.method }
                    : {}),
                  updatedAt: new Date(),
                }
              : {
                  stripeAccountId: null,
                  stripeChargesEnabled: false,
                  stripeDetailsSubmitted: false,
                  stripeConnectMethod: null,
                  updatedAt: new Date(),
                },
          )
          .where(scoped)
          .returning();
        return rows[0] ?? null;
      },
      async setLogo(input: { key: string | null; contentType: string | null }) {
        if (input.key !== null) {
          if (!keyOwnedBy(businessId, input.key, "logos")) {
            throw new Error("That file does not belong to this Business");
          }
          if (
            input.contentType !== "image/jpeg" &&
            input.contentType !== "image/png"
          ) {
            throw new Error("Logo must be a JPEG or PNG");
          }
        }
        const current = await db
          .select({ logoKey: business.logoKey })
          .from(business)
          .where(scoped)
          .limit(1);
        const rows = await db
          .update(business)
          .set({
            logoKey: input.key,
            logoContentType: input.key ? input.contentType : null,
            updatedAt: new Date(),
          })
          .where(scoped)
          .returning({ id: business.id });
        if (!rows[0]) throw new Error("A signed-in Business is required");
        return current[0]?.logoKey ?? null;
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
    clients: {
      async list() {
        return db
          .select()
          .from(client)
          .where(eq(client.businessId, businessId))
          .orderBy(asc(client.name));
      },
      async get(clientId: string) {
        const rows = await db
          .select()
          .from(client)
          .where(
            and(eq(client.id, clientId), eq(client.businessId, businessId)),
          )
          .limit(1);
        return rows[0] ?? null;
      },
      async create(input: ClientInput) {
        const now = new Date();
        const rows = await db
          .insert(client)
          .values({
            id: crypto.randomUUID(),
            businessId,
            name: input.name,
            email: input.email,
            phone: input.phone,
            address: input.address,
            taxExempt: input.taxExempt,
            note: input.note,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        const row = rows[0];
        if (!row) throw new Error("Could not save the Client");
        return row;
      },
      async update(clientId: string, input: ClientInput) {
        const rows = await db
          .update(client)
          .set({
            name: input.name,
            email: input.email,
            phone: input.phone,
            address: input.address,
            taxExempt: input.taxExempt,
            note: input.note,
            updatedAt: new Date(),
          })
          .where(
            and(eq(client.id, clientId), eq(client.businessId, businessId)),
          )
          .returning();
        return rows[0] ?? null;
      },
      async setArchived(clientId: string, archived: boolean) {
        const rows = await db
          .update(client)
          .set({
            archivedAt: archived ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(
            and(eq(client.id, clientId), eq(client.businessId, businessId)),
          )
          .returning();
        return rows[0] ?? null;
      },
    },
    taxRates: {
      async list() {
        return db
          .select()
          .from(taxRate)
          .where(eq(taxRate.businessId, businessId))
          .orderBy(asc(taxRate.name));
      },
      async get(taxRateId: string) {
        const rows = await db
          .select()
          .from(taxRate)
          .where(
            and(eq(taxRate.id, taxRateId), eq(taxRate.businessId, businessId)),
          )
          .limit(1);
        return rows[0] ?? null;
      },
      async create(input: TaxRateInput) {
        assertRateBps(input.rateBps);
        const now = new Date();
        const rows = await db
          .insert(taxRate)
          .values({
            id: crypto.randomUUID(),
            businessId,
            name: input.name,
            rateBps: input.rateBps,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        const row = rows[0];
        if (!row) throw new Error("Could not save the Tax Rate");
        return row;
      },
      async update(taxRateId: string, input: TaxRateInput) {
        assertRateBps(input.rateBps);
        const rows = await db
          .update(taxRate)
          .set({
            name: input.name,
            rateBps: input.rateBps,
            updatedAt: new Date(),
          })
          .where(
            and(eq(taxRate.id, taxRateId), eq(taxRate.businessId, businessId)),
          )
          .returning();
        return rows[0] ?? null;
      },
      async remove(taxRateId: string) {
        const rows = await db
          .delete(taxRate)
          .where(
            and(eq(taxRate.id, taxRateId), eq(taxRate.businessId, businessId)),
          )
          .returning({ id: taxRate.id });
        return rows.length;
      },
    },
    items: {
      async list() {
        const rows = await db
          .select()
          .from(item)
          .where(eq(item.businessId, businessId))
          .orderBy(asc(item.name));
        const rates = await ratesByItem(
          db,
          businessId,
          rows.map((row) => row.id),
        );
        return rows.map((row) => ({
          ...row,
          taxRates: rates.get(row.id) ?? [],
        }));
      },
      async get(itemId: string) {
        const rows = await db
          .select()
          .from(item)
          .where(and(eq(item.id, itemId), eq(item.businessId, businessId)))
          .limit(1);
        const row = rows[0];
        if (!row) return null;
        const rates = await ratesByItem(db, businessId, [row.id]);
        return { ...row, taxRates: rates.get(row.id) ?? [] };
      },
      async create(input: ItemInput) {
        const taxRateIds = await ownedTaxRateIds(
          db,
          businessId,
          input.taxRateIds,
        );
        const price = cents(input.unitPriceCents);
        const now = new Date();
        const id = crypto.randomUUID();
        await db.transaction(async (tx) => {
          await tx.insert(item).values({
            id,
            businessId,
            name: input.name,
            description: input.description,
            unitPriceCents: price,
            createdAt: now,
            updatedAt: now,
          });
          await replaceItemTaxRates(tx, businessId, id, taxRateIds);
        });
        const saved = await db
          .select()
          .from(item)
          .where(and(eq(item.id, id), eq(item.businessId, businessId)))
          .limit(1);
        const row = saved[0];
        if (!row) throw new Error("Could not save the Item");
        const rates = await ratesByItem(db, businessId, [id]);
        return { ...row, taxRates: rates.get(id) ?? [] };
      },
      async update(itemId: string, input: ItemInput) {
        const existing = await db
          .select({ id: item.id })
          .from(item)
          .where(and(eq(item.id, itemId), eq(item.businessId, businessId)))
          .limit(1);
        if (!existing[0]) return null;
        const taxRateIds = await ownedTaxRateIds(
          db,
          businessId,
          input.taxRateIds,
        );
        const price = cents(input.unitPriceCents);
        await db.transaction(async (tx) => {
          await tx
            .update(item)
            .set({
              name: input.name,
              description: input.description,
              unitPriceCents: price,
              updatedAt: new Date(),
            })
            .where(and(eq(item.id, itemId), eq(item.businessId, businessId)));
          await replaceItemTaxRates(tx, businessId, itemId, taxRateIds);
        });
        const saved = await db
          .select()
          .from(item)
          .where(and(eq(item.id, itemId), eq(item.businessId, businessId)))
          .limit(1);
        const row = saved[0];
        if (!row) return null;
        const rates = await ratesByItem(db, businessId, [itemId]);
        return { ...row, taxRates: rates.get(itemId) ?? [] };
      },
      async remove(itemId: string) {
        const rows = await db
          .delete(item)
          .where(and(eq(item.id, itemId), eq(item.businessId, businessId)))
          .returning({ id: item.id });
        return rows.length;
      },
    },
    invoices: invoiceMethods(db, businessId),
    payments: paymentMethods(db, businessId),
    categories: categoryMethods(db, businessId),
    expenses: expenseMethods(db, businessId),
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
