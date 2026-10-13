CREATE TABLE "item_drafts" (
	"item_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"base_revision" integer NOT NULL,
	"name" text NOT NULL,
	"description" jsonb NOT NULL,
	"attributes" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_drafts_item_id_author_id_pk" PRIMARY KEY("item_id","author_id")
);
--> statement-breakpoint
-- Hand-written: converts existing plain-text descriptions to rich-text documents, one paragraph per line (ADR 0005).
CREATE FUNCTION text_to_doc(t text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('type', 'doc', 'content',
    CASE WHEN t = '' THEN '[{"type":"paragraph"}]'::jsonb ELSE (
      SELECT jsonb_agg(
        CASE WHEN line = '' THEN '{"type":"paragraph"}'::jsonb
        ELSE jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', line)))
        END ORDER BY ord)
      FROM unnest(string_to_array(t, E'\n')) WITH ORDINALITY AS l(line, ord)
    ) END)
$$;--> statement-breakpoint
ALTER TABLE "item_revisions" ALTER COLUMN "description" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "item_revisions" ALTER COLUMN "description" SET DATA TYPE jsonb USING text_to_doc("description");--> statement-breakpoint
DROP FUNCTION text_to_doc(text);--> statement-breakpoint
ALTER TABLE "item_drafts" ADD CONSTRAINT "item_drafts_item_id_nodes_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_drafts" ADD CONSTRAINT "item_drafts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;