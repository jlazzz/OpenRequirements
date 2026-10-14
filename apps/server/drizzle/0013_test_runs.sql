CREATE TABLE "step_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"step" integer NOT NULL,
	"outcome" text NOT NULL,
	"actual" text DEFAULT '' NOT NULL,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"name" text NOT NULL,
	"environment" text DEFAULT '' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "test_plan_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"group_name" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "test_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "test_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"group_name" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"assignee_id" uuid
);
--> statement-breakpoint
ALTER TABLE "item_types" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "verification_results" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "verification_results" ADD COLUMN "defect_url" text;--> statement-breakpoint
ALTER TABLE "step_results" ADD CONSTRAINT "step_results_run_id_test_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."test_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_results" ADD CONSTRAINT "step_results_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cycles" ADD CONSTRAINT "test_cycles_plan_id_test_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."test_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cycles" ADD CONSTRAINT "test_cycles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cycles" ADD CONSTRAINT "test_cycles_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_plan_cases" ADD CONSTRAINT "test_plan_cases_plan_id_test_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."test_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_plan_cases" ADD CONSTRAINT "test_plan_cases_item_id_nodes_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_cycle_id_test_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."test_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_item_id_nodes_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_revision_id_item_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."item_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "step_results_run_id_index" ON "step_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "test_cycles_plan_id_index" ON "test_cycles" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "test_plan_cases_plan_id_index" ON "test_plan_cases" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "test_runs_cycle_id_index" ON "test_runs" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "test_runs_assignee_id_index" ON "test_runs" USING btree ("assignee_id");--> statement-breakpoint
ALTER TABLE "verification_results" ADD CONSTRAINT "verification_results_run_id_test_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."test_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_results" ADD CONSTRAINT "verification_results_runId_unique" UNIQUE("run_id");--> statement-breakpoint
-- Added by hand: existing projects found their test cases by an item type name containing "test" (ADR 0009).
-- That rule becomes the type's role, and every test case type gets the new "Steps" field after its other fields.
UPDATE "item_types" SET "role" = 'test' WHERE "name" ILIKE '%test%';--> statement-breakpoint
INSERT INTO "attribute_definitions" ("item_type_id", "name", "type", "position")
SELECT t."id", 'Steps', 'steps',
  coalesce((SELECT max(d."position") FROM "attribute_definitions" d WHERE d."item_type_id" = t."id"), -1) + 1
FROM "item_types" t
WHERE t."role" = 'test'
  AND NOT EXISTS (SELECT 1 FROM "attribute_definitions" d WHERE d."item_type_id" = t."id" AND d."type" = 'steps');
