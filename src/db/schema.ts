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

export const business = sqliteTable(
  "business",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    currency: text("currency").notNull().default("USD"),
    timeZone: text("time_zone").notNull(),
    address: text("address"),
    taxId: text("tax_id"),
    defaultTerms: text("default_terms"),
    footer: text("footer"),
    accentColor: text("accent_color"),
    /** Connected Account id only. Never a bank number, card number, or raw Stripe object. */
    stripeAccountId: text("stripe_account_id"),
    stripeChargesEnabled: integer("stripe_charges_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    stripeDetailsSubmitted: integer("stripe_details_submitted", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    /** account_link creates a Standard account. oauth links an existing one. */
    stripeConnectMethod: text("stripe_connect_method"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("business_stripe_account_idx").on(table.stripeAccountId),
    check(
      "business_stripe_connect_method",
      sql`${table.stripeConnectMethod} IS NULL OR ${table.stripeConnectMethod} in ('account_link', 'oauth')`,
    ),
  ],
);

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

/** Last Invoice Number issued for a Business. The next insert claims last_number + 1. */
export const invoiceCounter = sqliteTable("invoice_counter", {
  businessId: text("business_id")
    .primaryKey()
    .references(() => business.id, { onDelete: "cascade" }),
  lastNumber: integer("last_number").notNull(),
});

/**
 * Draft rows are editable. Sent, Partially Paid, Paid, and Void rows are not.
 * Overdue is derived from due_date. snapshot is written on Send and then left alone (ADR 0005).
 */
export const invoice = sqliteTable(
  "invoice",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => client.id),
    number: integer("number").notNull(),
    status: text("status").notNull(),
    issueDate: text("issue_date").notNull(),
    dueDate: text("due_date").notNull(),
    reference: text("reference"),
    notes: text("notes"),
    terms: text("terms"),
    voidReason: text("void_reason"),
    voidedAt: integer("voided_at", { mode: "timestamp_ms" }),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    firstViewedAt: integer("first_viewed_at", { mode: "timestamp_ms" }),
    subtotalCents: integer("subtotal_cents").notNull(),
    taxCents: integer("tax_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    snapshot: text("snapshot"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("invoice_business_number_idx").on(
      table.businessId,
      table.number,
    ),
    index("invoice_business_idx").on(table.businessId, table.createdAt),
    index("invoice_client_idx").on(table.clientId),
    check(
      "invoice_status",
      sql`${table.status} in ('draft', 'sent', 'partial', 'paid', 'void')`,
    ),
    check(
      "invoice_number_positive",
      sql`${table.number} > 0 AND typeof(${table.number}) = 'integer'`,
    ),
    check(
      "invoice_cents_integer",
      sql`typeof(${table.subtotalCents}) = 'integer' AND typeof(${table.taxCents}) = 'integer' AND typeof(${table.totalCents}) = 'integer'`,
    ),
  ],
);

/** Copied onto the Invoice. Not a live reference to an Item (ADR 0005). */
export const invoiceLine = sqliteTable(
  "invoice_line",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoice.id, { onDelete: "cascade" }),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
  },
  (table) => [
    index("invoice_line_invoice_idx").on(table.invoiceId, table.position),
    index("invoice_line_business_idx").on(table.businessId),
    check(
      "invoice_line_quantity",
      sql`${table.quantity} > 0 AND typeof(${table.quantity}) = 'integer'`,
    ),
    check(
      "invoice_line_price",
      sql`${table.unitPriceCents} >= 0 AND typeof(${table.unitPriceCents}) = 'integer'`,
    ),
  ],
);

/** Name and basis points are copied. tax_rate_id is only so a draft can follow a rename before Send. */
export const invoiceLineTax = sqliteTable(
  "invoice_line_tax",
  {
    id: text("id").primaryKey(),
    lineId: text("line_id")
      .notNull()
      .references(() => invoiceLine.id, { onDelete: "cascade" }),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    taxRateId: text("tax_rate_id").references(() => taxRate.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    rateBps: integer("rate_bps").notNull(),
    taxCents: integer("tax_cents").notNull(),
  },
  (table) => [
    index("invoice_line_tax_line_idx").on(table.lineId),
    index("invoice_line_tax_business_idx").on(table.businessId),
    check(
      "invoice_line_tax_bps",
      sql`${table.rateBps} >= 0 AND ${table.rateBps} <= 10000 AND typeof(${table.rateBps}) = 'integer'`,
    ),
    check("invoice_line_tax_cents", sql`typeof(${table.taxCents}) = 'integer'`),
  ],
);

/** Stores the hash of an Invoice Link. The token itself is shown once and never written. */
export const invoiceLink = sqliteTable(
  "invoice_link",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoice.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("invoice_link_token_hash_idx").on(table.tokenHash),
    index("invoice_link_invoice_idx").on(table.invoiceId),
    index("invoice_link_business_idx").on(table.businessId),
  ],
);

/**
 * Money received against one Invoice. Several rows are allowed.
 * fee_cents is the Stripe processing fee from the balance transaction.
 * ponytail: PR 5 creates the Merchant Fee Expense from fee_cents on stripe
 * Payments. Do not copy the fee into another table before that.
 */
export const payment = sqliteTable(
  "payment",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoice.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    paidOn: text("paid_on").notNull(),
    method: text("method").notNull(),
    note: text("note"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeChargeId: text("stripe_charge_id"),
    stripeBalanceTransactionId: text("stripe_balance_transaction_id"),
    feeCents: integer("fee_cents"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("payment_invoice_idx").on(table.businessId, table.invoiceId),
    uniqueIndex("payment_checkout_session_idx").on(
      table.stripeCheckoutSessionId,
    ),
    uniqueIndex("payment_intent_idx").on(table.stripePaymentIntentId),
    check(
      "payment_amount_cents",
      sql`${table.amountCents} > 0 AND typeof(${table.amountCents}) = 'integer'`,
    ),
    check(
      "payment_fee_cents",
      sql`${table.feeCents} IS NULL OR (${table.feeCents} >= 0 AND typeof(${table.feeCents}) = 'integer')`,
    ),
    check(
      "payment_method",
      sql`${table.method} in ('stripe', 'check', 'cash', 'venmo', 'other')`,
    ),
  ],
);

/** One-time OAuth state. Tied to the Owner's user id and Business. The code is not stored. */
export const stripeOauthState = sqliteTable("stripe_oauth_state", {
  state: text("state").primaryKey(),
  businessId: text("business_id")
    .notNull()
    .references(() => business.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

/** Processed Stripe event id. The payload is not stored; it can contain PII. */
export const stripeEvent = sqliteTable("stripe_event", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
