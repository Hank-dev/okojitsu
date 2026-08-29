CREATE TABLE `custom_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_custom_categories_updated_at` ON `custom_categories` (`updated_at`);--> statement-breakpoint
CREATE TABLE `custom_games` (
	`id` text PRIMARY KEY NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_custom_games_updated_at` ON `custom_games` (`updated_at`);