CREATE TABLE "baseline_entries" (
	"baseline_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"revision_id" uuid,
	"parent_id" uuid,
	"position" integer NOT NULL,
	"name" text,
	CONSTRAINT "baseline_entries_baseline_id_node_id_pk" PRIMARY KEY("baseline_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "baseline_links" (
	"baseline_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	CONSTRAINT "baseline_links_baseline_id_link_id_pk" PRIMARY KEY("baseline_id","link_id")
);
--> statement-breakpoint
CREATE TABLE "baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"set_id" uuid,
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "baseline_entries" ADD CONSTRAINT "baseline_entries_baseline_id_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."baselines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baseline_entries" ADD CONSTRAINT "baseline_entries_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baseline_entries" ADD CONSTRAINT "baseline_entries_revision_id_item_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."item_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baseline_links" ADD CONSTRAINT "baseline_links_baseline_id_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."baselines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baseline_links" ADD CONSTRAINT "baseline_links_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;