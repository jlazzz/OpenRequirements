CREATE TABLE "audit_anchors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint NOT NULL,
	"hash" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"prev_anchor_hash" text NOT NULL,
	"anchor_hash" text NOT NULL,
	"signature" text,
	"created_by" uuid,
	CONSTRAINT "audit_anchors_seq_unique" UNIQUE("seq")
);
--> statement-breakpoint
ALTER TABLE "audit_anchors" ADD CONSTRAINT "audit_anchors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;