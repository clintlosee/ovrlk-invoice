import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
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
