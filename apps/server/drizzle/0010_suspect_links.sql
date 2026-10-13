CREATE TABLE "link_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"upstream_revision" integer NOT NULL,
	"downstream_revision" integer NOT NULL,
	"confirmed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "link_revisions_linkId_number_unique" UNIQUE("link_id","number")
);
--> statement-breakpoint
ALTER TABLE "baseline_links" ADD COLUMN "suspect" boolean;--> statement-breakpoint
ALTER TABLE "link_revisions" ADD CONSTRAINT "link_revisions_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_revisions" ADD CONSTRAINT "link_revisions_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;