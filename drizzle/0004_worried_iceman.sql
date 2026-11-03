CREATE TABLE `stripe_oauth_state` (
	`state` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_business` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`time_zone` text NOT NULL,
	`address` text,
	`tax_id` text,
	`default_terms` text,
	`footer` text,
	`accent_color` text,
	`stripe_account_id` text,
	`stripe_charges_enabled` integer DEFAULT false NOT NULL,
	`stripe_details_submitted` integer DEFAULT false NOT NULL,
	`stripe_connect_method` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "business_stripe_connect_method" CHECK("__new_business"."stripe_connect_method" IS NULL OR "__new_business"."stripe_connect_method" in ('account_link', 'oauth'))
);
--> statement-breakpoint
INSERT INTO `__new_business`("id", "name", "currency", "time_zone", "address", "tax_id", "default_terms", "footer", "accent_color", "stripe_account_id", "stripe_charges_enabled", "stripe_details_submitted", "stripe_connect_method", "created_at", "updated_at") SELECT "id", "name", "currency", "time_zone", "address", "tax_id", "default_terms", "footer", "accent_color", "stripe_account_id", "stripe_charges_enabled", "stripe_details_submitted", NULL, "created_at", "updated_at" FROM `business`;--> statement-breakpoint
DROP TABLE `business`;--> statement-breakpoint
ALTER TABLE `__new_business` RENAME TO `business`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `business_stripe_account_idx` ON `business` (`stripe_account_id`);