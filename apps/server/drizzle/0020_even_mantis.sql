CREATE TABLE "ci_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"pipeline" text DEFAULT '' NOT NULL,
	"branch" text DEFAULT '' NOT NULL,
	"commit" text DEFAULT '' NOT NULL,
	"build_url" text DEFAULT '' NOT NULL,
	"passed" integer NOT NULL,
	"failed" integer NOT NULL,
	"skipped" integer NOT NULL,
	"unmatched" integer NOT NULL,
	"unmatched_names" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verification_results" ADD COLUMN "ci_run_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ci_runs_project_id_created_at_index" ON "ci_runs" USING btree ("project_id","created_at");--> statement-breakpoint
ALTER TABLE "verification_results" ADD CONSTRAINT "verification_results_ci_run_id_ci_runs_id_fk" FOREIGN KEY ("ci_run_id") REFERENCES "public"."ci_runs"("id") ON DELETE no action ON UPDATE no action;