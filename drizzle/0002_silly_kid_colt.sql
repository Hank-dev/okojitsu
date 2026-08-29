CREATE TABLE `game_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`source_game_id` text,
	`payload_json` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_game_drafts_updated_at` ON `game_drafts` (`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_game_drafts_source_game` ON `game_drafts` (`source_game_id`) WHERE "game_drafts"."source_game_id" is not null;