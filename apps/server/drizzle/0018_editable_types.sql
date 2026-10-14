ALTER TABLE "attribute_definitions" ADD COLUMN "archived_options" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "attribute_definitions" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "item_types" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "link_types" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "link_types" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sets" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
-- Edited by hand: the relationship type that counted for verification was found by its name. It now carries the role.
UPDATE "link_types" SET "role" = 'verifies' WHERE lower(trim("name")) = 'verified by';
