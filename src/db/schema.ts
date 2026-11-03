import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

export * from "./auth-schema";

/** v1 has exactly one Owner per Business. The column stays text so later roles are data, not a migration. */
export const OWNER_ROLE = "owner";

export const business = sqliteTable("business", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("USD"),
  timeZone: text("time_zone").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const member = sqliteTable(
  "member",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("member_user_business_idx").on(table.businessId, table.userId),
    uniqueIndex("member_one_owner_idx")
      .on(table.businessId)
      .where(sql`${table.role} = 'owner'`),
    index("member_user_id_idx").on(table.userId),
  ],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id").references(() => business.id),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    amountCents: integer("amount_cents"),
    metadata: text("metadata"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("audit_log_business_idx").on(table.businessId, table.createdAt),
    check(
      "audit_amount_cents_integer",
      sql`${table.amountCents} IS NULL OR typeof(${table.amountCents}) = 'integer'`,
    ),
  ],
);

/** App-level limiter for auth and future public Invoice Links. Separate from Better Auth's rate_limit table. */
export const requestLimit = sqliteTable("request_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: integer("window_start").notNull(),
});

/**
 * A Client the Business bills. Clients never sign in.
 * Archived instead of deleted so a later Invoice can keep its Client (ADR 0005).
 */
export const client = sqliteTable(
  "client",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    address: text("address"),
    taxExempt: integer("tax_exempt", { mode: "boolean" })
      .notNull()
      .default(false),
    note: text("note"),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("client_business_idx").on(table.businessId)],
);

/**
 * Named percentage for one Business.
 * Stored as basis points: 100 bps = 1%, so 725 is 7.25%. Never a float.
 * ponytail: 0.01% resolution. Switch this column to millionths of the rate if a Tax Rate needs a third decimal.
 */
export const taxRate = sqliteTable(
  "tax_rate",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    rateBps: integer("rate_bps").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("tax_rate_business_idx").on(table.businessId),
    check(
      "tax_rate_bps_integer",
      sql`${table.rateBps} >= 0 AND ${table.rateBps} <= 10000 AND typeof(${table.rateBps}) = 'integer'`,
    ),
  ],
);

/** Saved Item. Invoice Lines copy it; they do not reference it (ADR 0005). */
export const item = sqliteTable(
  "item",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    unitPriceCents: integer("unit_price_cents").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("item_business_idx").on(table.businessId),
    check(
      "item_unit_price_cents_integer",
      sql`typeof(${table.unitPriceCents}) = 'integer'`,
    ),
  ],
);

/** An Item's default Tax Rates. Both sides belong to the same Business. */
export const itemTaxRate = sqliteTable(
  "item_tax_rate",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    taxRateId: text("tax_rate_id")
      .notNull()
      .references(() => taxRate.id, { onDelete: "cascade" }),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.taxRateId] }),
    index("item_tax_rate_business_idx").on(table.businessId),
    index("item_tax_rate_tax_rate_idx").on(table.taxRateId),
  ],
);
