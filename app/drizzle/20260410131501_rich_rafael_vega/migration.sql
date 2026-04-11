CREATE TABLE "fact_org_aggregate_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"org_id" integer,
	"scope" varchar(20) DEFAULT 'organization' NOT NULL,
	"daily_active_users" integer DEFAULT 0,
	"weekly_active_users" integer DEFAULT 0,
	"monthly_active_users" integer DEFAULT 0,
	"monthly_active_agent_users" integer DEFAULT 0,
	"monthly_active_chat_users" integer DEFAULT 0,
	"daily_active_cli_users" integer DEFAULT 0,
	"pr_total_created" integer DEFAULT 0,
	"pr_total_reviewed" integer DEFAULT 0,
	"pr_total_merged" integer DEFAULT 0,
	"pr_median_minutes_to_merge" numeric,
	"pr_total_suggestions" integer DEFAULT 0,
	"pr_total_applied_suggestions" integer DEFAULT 0,
	"pr_total_created_by_copilot" integer DEFAULT 0,
	"pr_total_reviewed_by_copilot" integer DEFAULT 0,
	"pr_total_merged_created_by_copilot" integer DEFAULT 0,
	"pr_total_merged_reviewed_by_copilot" integer DEFAULT 0,
	"pr_median_minutes_to_merge_copilot_authored" numeric,
	"pr_median_minutes_to_merge_copilot_reviewed" numeric,
	"pr_total_copilot_suggestions" integer DEFAULT 0,
	"pr_total_copilot_applied_suggestions" integer DEFAULT 0
);
--> statement-breakpoint
ALTER TABLE "dim_org" ADD COLUMN "github_org_id" integer;--> statement-breakpoint
ALTER TABLE "ingestion_log" ADD COLUMN "org_name" varchar(255);--> statement-breakpoint
ALTER TABLE "ingestion_log" ADD COLUMN "orgs_discovered" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "ingestion_log" ADD COLUMN "aggregate_records" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "fact_org_aggregate_daily" ADD CONSTRAINT "fact_org_aggregate_daily_org_id_dim_org_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."dim_org"("org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_fact_org_agg_unique" ON "fact_org_aggregate_daily" USING btree ("day","org_id","scope");--> statement-breakpoint
CREATE INDEX "idx_fact_org_agg_day" ON "fact_org_aggregate_daily" USING btree ("day");