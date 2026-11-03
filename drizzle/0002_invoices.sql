CREATE TABLE `invoice` (
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
	CONSTRAINT "invoice_status" CHECK("invoice"."status" in ('draft', 'sent', 'paid', 'void')),
	CONSTRAINT "invoice_number_positive" CHECK("invoice"."number" > 0 AND typeof("invoice"."number") = 'integer'),
	CONSTRAINT "invoice_cents_integer" CHECK(typeof("invoice"."subtotal_cents") = 'integer' AND typeof("invoice"."tax_cents") = 'integer' AND typeof("invoice"."total_cents") = 'integer')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_business_number_idx` ON `invoice` (`business_id`,`number`);--> statement-breakpoint
CREATE INDEX `invoice_business_idx` ON `invoice` (`business_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `invoice_client_idx` ON `invoice` (`client_id`);--> statement-breakpoint
CREATE TABLE `invoice_counter` (
	`business_id` text PRIMARY KEY NOT NULL,
	`last_number` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invoice_line` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`business_id` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`quantity` integer NOT NULL,
	`unit_price_cents` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoice`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "invoice_line_quantity" CHECK("invoice_line"."quantity" > 0 AND typeof("invoice_line"."quantity") = 'integer'),
	CONSTRAINT "invoice_line_price" CHECK("invoice_line"."unit_price_cents" >= 0 AND typeof("invoice_line"."unit_price_cents") = 'integer')
);
--> statement-breakpoint
CREATE INDEX `invoice_line_invoice_idx` ON `invoice_line` (`invoice_id`,`position`);--> statement-breakpoint
CREATE INDEX `invoice_line_business_idx` ON `invoice_line` (`business_id`);--> statement-breakpoint
CREATE TABLE `invoice_line_tax` (
	`id` text PRIMARY KEY NOT NULL,
	`line_id` text NOT NULL,
	`business_id` text NOT NULL,
	`tax_rate_id` text,
	`name` text NOT NULL,
	`rate_bps` integer NOT NULL,
	`tax_cents` integer NOT NULL,
	FOREIGN KEY (`line_id`) REFERENCES `invoice_line`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rate`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "invoice_line_tax_bps" CHECK("invoice_line_tax"."rate_bps" >= 0 AND "invoice_line_tax"."rate_bps" <= 10000 AND typeof("invoice_line_tax"."rate_bps") = 'integer'),
	CONSTRAINT "invoice_line_tax_cents" CHECK(typeof("invoice_line_tax"."tax_cents") = 'integer')
);
--> statement-breakpoint
CREATE INDEX `invoice_line_tax_line_idx` ON `invoice_line_tax` (`line_id`);--> statement-breakpoint
CREATE INDEX `invoice_line_tax_business_idx` ON `invoice_line_tax` (`business_id`);--> statement-breakpoint
CREATE TABLE `invoice_link` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoice`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_link_token_hash_idx` ON `invoice_link` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invoice_link_invoice_idx` ON `invoice_link` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `invoice_link_business_idx` ON `invoice_link` (`business_id`);--> statement-breakpoint
ALTER TABLE `business` ADD `address` text;--> statement-breakpoint
ALTER TABLE `business` ADD `tax_id` text;--> statement-breakpoint
ALTER TABLE `business` ADD `default_terms` text;--> statement-breakpoint
ALTER TABLE `business` ADD `footer` text;--> statement-breakpoint
ALTER TABLE `business` ADD `accent_color` text;