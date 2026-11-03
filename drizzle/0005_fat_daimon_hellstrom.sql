CREATE TABLE `expense_category` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`category_group` text NOT NULL,
	`system_key` text,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "expense_category_group" CHECK("expense_category"."category_group" in ('schedule_c', 'cogs'))
);
--> statement-breakpoint
CREATE INDEX `expense_category_business_idx` ON `expense_category` (`business_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `expense_category_system_idx` ON `expense_category` (`business_id`,`system_key`) WHERE "expense_category"."system_key" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `expense` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`spent_on` text NOT NULL,
	`merchant` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`category_id` text NOT NULL,
	`client_id` text,
	`tax_paid_cents` integer DEFAULT 0 NOT NULL,
	`note` text,
	`receipt_key` text,
	`receipt_content_type` text,
	`payment_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `expense_category`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `client`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payment`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "expense_amount_cents" CHECK("expense"."amount_cents" > 0 AND typeof("expense"."amount_cents") = 'integer'),
	CONSTRAINT "expense_tax_paid_cents" CHECK("expense"."tax_paid_cents" >= 0 AND typeof("expense"."tax_paid_cents") = 'integer')
);
--> statement-breakpoint
CREATE INDEX `expense_business_date_idx` ON `expense` (`business_id`,`spent_on`);--> statement-breakpoint
CREATE INDEX `expense_category_idx` ON `expense` (`category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `expense_payment_idx` ON `expense` (`payment_id`);--> statement-breakpoint
ALTER TABLE `business` ADD `logo_key` text;--> statement-breakpoint
ALTER TABLE `business` ADD `logo_content_type` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_payment` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`paid_on` text NOT NULL,
	`method` text NOT NULL,
	`note` text,
	`stripe_checkout_session_id` text,
	`stripe_payment_intent_id` text,
	`stripe_charge_id` text,
	`stripe_balance_transaction_id` text,
	`fee_cents` integer,
	`refunded_cents` integer DEFAULT 0 NOT NULL,
	`stripe_refund_ids` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoice`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "payment_amount_cents" CHECK("__new_payment"."amount_cents" > 0 AND typeof("__new_payment"."amount_cents") = 'integer'),
	CONSTRAINT "payment_fee_cents" CHECK("__new_payment"."fee_cents" IS NULL OR ("__new_payment"."fee_cents" >= 0 AND typeof("__new_payment"."fee_cents") = 'integer')),
	CONSTRAINT "payment_refunded_cents" CHECK("__new_payment"."refunded_cents" >= 0 AND "__new_payment"."refunded_cents" <= "__new_payment"."amount_cents" AND typeof("__new_payment"."refunded_cents") = 'integer'),
	CONSTRAINT "payment_method" CHECK("__new_payment"."method" in ('stripe', 'check', 'cash', 'venmo', 'other'))
);
--> statement-breakpoint
INSERT INTO `__new_payment`("id", "business_id", "invoice_id", "amount_cents", "paid_on", "method", "note", "stripe_checkout_session_id", "stripe_payment_intent_id", "stripe_charge_id", "stripe_balance_transaction_id", "fee_cents", "refunded_cents", "stripe_refund_ids", "created_at", "updated_at") SELECT "id", "business_id", "invoice_id", "amount_cents", "paid_on", "method", "note", "stripe_checkout_session_id", "stripe_payment_intent_id", "stripe_charge_id", "stripe_balance_transaction_id", "fee_cents", 0, NULL, "created_at", "updated_at" FROM `payment`;--> statement-breakpoint
DROP TABLE `payment`;--> statement-breakpoint
ALTER TABLE `__new_payment` RENAME TO `payment`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `payment_invoice_idx` ON `payment` (`business_id`,`invoice_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_checkout_session_idx` ON `payment` (`stripe_checkout_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_intent_idx` ON `payment` (`stripe_payment_intent_id`);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Advertising', 'schedule_c', 'advertising', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'advertising'
);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Car and truck', 'schedule_c', 'car_and_truck', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'car_and_truck'
);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Contract labor', 'schedule_c', 'contract_labor', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'contract_labor'
);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Depreciation', 'schedule_c', 'depreciation', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'depreciation'
);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Insurance', 'schedule_c', 'insurance', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'insurance'
);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Legal and professional', 'schedule_c', 'legal_and_professional', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'legal_and_professional'
);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Office expense', 'schedule_c', 'office_expense', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'office_expense'
);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Rent or lease', 'schedule_c', 'rent_or_lease', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'rent_or_lease'
);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Repairs', 'schedule_c', 'repairs', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'repairs'
);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Supplies', 'schedule_c', 'supplies', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'supplies'
);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Taxes and licenses', 'schedule_c', 'taxes_and_licenses', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'taxes_and_licenses'
);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Travel', 'schedule_c', 'travel', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'travel'
);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Meals', 'schedule_c', 'meals', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'meals'
);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Utilities', 'schedule_c', 'utilities', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'utilities'
);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Other', 'schedule_c', 'other', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'other'
);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Merchant fees', 'schedule_c', 'merchant_fees', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'merchant_fees'
);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Print costs', 'cogs', 'cogs_print', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'cogs_print'
);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Framing', 'cogs', 'cogs_framing', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'cogs_framing'
);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Materials', 'cogs', 'cogs_materials', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'cogs_materials'
);
--> statement-breakpoint
INSERT INTO expense_category (id, business_id, name, category_group, system_key, archived_at, created_at, updated_at)
SELECT lower(hex(randomblob(16))), business.id, 'Shipping of goods', 'cogs', 'cogs_shipping', NULL, cast(strftime('%s','now') as integer) * 1000, cast(strftime('%s','now') as integer) * 1000
FROM business
WHERE NOT EXISTS (
  SELECT 1 FROM expense_category
  WHERE expense_category.business_id = business.id
    AND expense_category.system_key = 'cogs_shipping'
);
