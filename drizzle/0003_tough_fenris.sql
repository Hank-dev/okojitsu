CREATE TABLE `session_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`payload_json` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_session_drafts_updated_at` ON `session_drafts` (`updated_at`);