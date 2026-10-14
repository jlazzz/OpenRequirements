CREATE TABLE "baseline_verification" (
	"baseline_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"status" text NOT NULL,
	"out_of_date" boolean NOT NULL,
	CONSTRAINT "baseline_verification_baseline_id_item_id_pk" PRIMARY KEY("baseline_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "result_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"result_id" uuid,
	"run_id" uuid,
	"step" integer,
	"attachment_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "test_cycles" ADD COLUMN "baseline_id" uuid;--> statement-breakpoint
ALTER TABLE "baseline_verification" ADD CONSTRAINT "baseline_verification_baseline_id_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."baselines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baseline_verification" ADD CONSTRAINT "baseline_verification_item_id_nodes_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_attachments" ADD CONSTRAINT "result_attachments_result_id_verification_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."verification_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_attachments" ADD CONSTRAINT "result_attachments_run_id_test_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."test_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_attachments" ADD CONSTRAINT "result_attachments_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_attachments" ADD CONSTRAINT "result_attachments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "result_attachments_result_id_index" ON "result_attachments" USING btree ("result_id");--> statement-breakpoint
CREATE INDEX "result_attachments_run_id_index" ON "result_attachments" USING btree ("run_id");--> statement-breakpoint
ALTER TABLE "test_cycles" ADD CONSTRAINT "test_cycles_baseline_id_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."baselines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Written by hand: the one evidence image a result could carry until now becomes its first evidence file.
INSERT INTO "result_attachments" ("result_id", "attachment_id", "created_by", "created_at")
SELECT "id", "attachment_id", "recorded_by", "created_at" FROM "verification_results" WHERE "attachment_id" IS NOT NULL;
