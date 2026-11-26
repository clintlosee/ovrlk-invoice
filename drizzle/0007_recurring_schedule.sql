CREATE TABLE `recurring_expense` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`merchant` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`category_id` text NOT NULL,
	`client_id` text,
	`tax_paid_cents` integer DEFAULT 0 NOT NULL,
	`note` text,
	`interval_count` integer NOT NULL,
	`interval_unit` text NOT NULL,
	`anchor_on` text NOT NULL,
	`next_on` text NOT NULL,
	`remaining_count` integer,
	`paused` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `expense_category`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `client`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recurring_expense_amount_cents" CHECK("recurring_expense"."amount_cents" > 0 AND typeof("recurring_expense"."amount_cents") = 'integer'),
	CONSTRAINT "recurring_expense_tax_paid_cents" CHECK("recurring_expense"."tax_paid_cents" >= 0 AND typeof("recurring_expense"."tax_paid_cents") = 'integer'),
	CONSTRAINT "recurring_expense_interval_count" CHECK("recurring_expense"."interval_count" >= 1 AND typeof("recurring_expense"."interval_count") = 'integer'),
	CONSTRAINT "recurring_expense_interval_unit" CHECK("recurring_expense"."interval_unit" in ('day', 'week', 'month', 'year')),
	CONSTRAINT "recurring_expense_remaining" CHECK("recurring_expense"."remaining_count" is null or ("recurring_expense"."remaining_count" >= 0 AND typeof("recurring_expense"."remaining_count") = 'integer'))
);
--> statement-breakpoint
CREATE INDEX `recurring_expense_due_idx` ON `recurring_expense` (`business_id`,`next_on`);--> statement-breakpoint
ALTER TABLE `expense` ADD `recurring_expense_id` text REFERENCES `recurring_expense`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX `expense_recurring_occurrence_idx` ON `expense` (`recurring_expense_id`,`spent_on`) WHERE "expense"."recurring_expense_id" IS NOT NULL;