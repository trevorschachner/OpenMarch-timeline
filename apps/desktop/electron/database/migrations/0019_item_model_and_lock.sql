ALTER TABLE `items` ADD `model` text;--> statement-breakpoint
ALTER TABLE `items` ADD `locked` integer DEFAULT false NOT NULL;