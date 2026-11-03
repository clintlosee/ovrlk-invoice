CREATE TABLE `client` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`address` text,
	`tax_exempt` integer DEFAULT false NOT NULL,
	`note` text,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `client_business_idx` ON `client` (`business_id`);--> statement-breakpoint
CREATE TABLE `item` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`unit_price_cents` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "item_unit_price_cents_integer" CHECK(typeof("item"."unit_price_cents") = 'integer')
);
--> statement-breakpoint
CREATE INDEX `item_business_idx` ON `item` (`business_id`);--> statement-breakpoint
CREATE TABLE `item_tax_rate` (
	`item_id` text NOT NULL,
	`tax_rate_id` text NOT NULL,
	`business_id` text NOT NULL,
	PRIMARY KEY(`item_id`, `tax_rate_id`),
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rate`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_tax_rate_business_idx` ON `item_tax_rate` (`business_id`);--> statement-breakpoint
CREATE INDEX `item_tax_rate_tax_rate_idx` ON `item_tax_rate` (`tax_rate_id`);--> statement-breakpoint
CREATE TABLE `tax_rate` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`rate_bps` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tax_rate_bps_integer" CHECK("tax_rate"."rate_bps" >= 0 AND "tax_rate"."rate_bps" <= 10000 AND typeof("tax_rate"."rate_bps") = 'integer')
);
--> statement-breakpoint
CREATE INDEX `tax_rate_business_idx` ON `tax_rate` (`business_id`);