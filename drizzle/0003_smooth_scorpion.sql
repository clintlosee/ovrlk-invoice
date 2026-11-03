CREATE TABLE `payment` (
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
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoice`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "payment_amount_cents" CHECK("payment"."amount_cents" > 0 AND typeof("payment"."amount_cents") = 'integer'),
	CONSTRAINT "payment_fee_cents" CHECK("payment"."fee_cents" IS NULL OR ("payment"."fee_cents" >= 0 AND typeof("payment"."fee_cents") = 'integer')),
	CONSTRAINT "payment_method" CHECK("payment"."method" in ('stripe', 'check', 'cash', 'venmo', 'other'))
);
--> statement-breakpoint
CREATE INDEX `payment_invoice_idx` ON `payment` (`business_id`,`invoice_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_checkout_session_idx` ON `payment` (`stripe_checkout_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_intent_idx` ON `payment` (`stripe_payment_intent_id`);--> statement-breakpoint
CREATE TABLE `stripe_event` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_invoice` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`client_id` text NOT NULL,
	`number` integer NOT NULL,
	`status` text NOT NULL,
	`issue_date` text NOT NULL,
	`due_date` text NOT NULL,
	`reference` text,
	`notes` text,
	`terms` text,
	`void_reason` text,
	`voided_at` integer,
	`sent_at` integer,
	`first_viewed_at` integer,
	`subtotal_cents` integer NOT NULL,
	`tax_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`snapshot` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `client`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invoice_status" CHECK("__new_invoice"."status" in ('draft', 'sent', 'partial', 'paid', 'void')),
	CONSTRAINT "invoice_number_positive" CHECK("__new_invoice"."number" > 0 AND typeof("__new_invoice"."number") = 'integer'),
	CONSTRAINT "invoice_cents_integer" CHECK(typeof("__new_invoice"."subtotal_cents") = 'integer' AND typeof("__new_invoice"."tax_cents") = 'integer' AND typeof("__new_invoice"."total_cents") = 'integer')
);
--> statement-breakpoint
INSERT INTO `__new_invoice`("id", "business_id", "client_id", "number", "status", "issue_date", "due_date", "reference", "notes", "terms", "void_reason", "voided_at", "sent_at", "first_viewed_at", "subtotal_cents", "tax_cents", "total_cents", "snapshot", "created_at", "updated_at") SELECT "id", "business_id", "client_id", "number", "status", "issue_date", "due_date", "reference", "notes", "terms", "void_reason", "voided_at", "sent_at", "first_viewed_at", "subtotal_cents", "tax_cents", "total_cents", "snapshot", "created_at", "updated_at" FROM `invoice`;--> statement-breakpoint
DROP TABLE `invoice`;--> statement-breakpoint
ALTER TABLE `__new_invoice` RENAME TO `invoice`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_business_number_idx` ON `invoice` (`business_id`,`number`);--> statement-breakpoint
CREATE INDEX `invoice_business_idx` ON `invoice` (`business_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `invoice_client_idx` ON `invoice` (`client_id`);--> statement-breakpoint
ALTER TABLE `business` ADD `stripe_account_id` text;--> statement-breakpoint
ALTER TABLE `business` ADD `stripe_charges_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `business` ADD `stripe_details_submitted` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `business_stripe_account_idx` ON `business` (`stripe_account_id`);