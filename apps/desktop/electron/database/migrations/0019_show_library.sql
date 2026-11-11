CREATE TABLE `library_blobs` (
	`hash` text PRIMARY KEY NOT NULL,
	`data` blob NOT NULL,
	CONSTRAINT "library_blobs_hash_check" CHECK(length(hash) = 64),
	CONSTRAINT "library_blobs_data_type_check" CHECK(typeof(data) = 'blob')
);
--> statement-breakpoint
CREATE TABLE `library_items` (
	`item_id` text NOT NULL,
	`version_hash` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`built_in` integer DEFAULT 0 NOT NULL,
	`parts` text NOT NULL,
	`pins` text DEFAULT '[]' NOT NULL,
	`metadata` text NOT NULL,
	`sidecar` text,
	`embedded_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY(`item_id`, `version_hash`),
	CONSTRAINT "library_items_kind_check" CHECK(kind IN ('model', 'artwork', 'uniform')),
	CONSTRAINT "library_items_built_in_check" CHECK(built_in IN (0, 1)),
	CONSTRAINT "library_items_version_hash_check" CHECK(length(version_hash) = 64)
);
--> statement-breakpoint
-- A prop's Library model (ADR 0010 D-12). Hand-edited from drizzle-kit's `__new_items` rebuild,
-- whose INSERT ... SELECT copied these columns from a table that doesn't have them yet. ADD COLUMN
-- leaves `items` and every row that references it untouched; the named CHECK matches the
-- snapshot, so `drizzle-kit generate` stays a no-op. The hash goes first so the item id's CHECK
-- can name it. History triggers on `items` are rebuilt for the new columns when the show opens
-- (`dropStaleHistoryTriggers`). Files a fork build saved with these tables or columns had them
-- removed by the legacy repair (`PARKED_TABLES`), which runs before this.
ALTER TABLE `items` ADD COLUMN `library_version_hash` text;--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `library_item_id` text CONSTRAINT "items_library_check" CHECK((library_item_id IS NULL AND library_version_hash IS NULL) OR (library_item_id IS NOT NULL AND library_version_hash IS NOT NULL AND length(library_item_id) = 36 AND length(library_version_hash) = 64));
