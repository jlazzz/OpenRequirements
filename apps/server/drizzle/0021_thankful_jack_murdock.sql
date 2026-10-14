-- Hand-checked: the new "id" column is filled for existing rows by its default; their added_at is the migration time.
-- Only removed_at and removed_by are updated afterwards (a participant is removed, never deleted).
ALTER TABLE "review_participants" DROP CONSTRAINT "review_participants_review_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "review_participants" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "review_participants" ADD COLUMN "added_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "review_participants" ADD COLUMN "added_by" uuid;--> statement-breakpoint
ALTER TABLE "review_participants" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_participants" ADD COLUMN "removed_by" uuid;--> statement-breakpoint
ALTER TABLE "review_participants" ADD CONSTRAINT "review_participants_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_participants" ADD CONSTRAINT "review_participants_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_participants_review_id_user_id_index" ON "review_participants" USING btree ("review_id","user_id") WHERE "review_participants"."removed_at" is null;