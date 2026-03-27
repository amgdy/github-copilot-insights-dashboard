CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"metric_name" varchar(255) NOT NULL,
	"condition" varchar(20) NOT NULL,
	"threshold" numeric NOT NULL,
	"scope_type" varchar(20) DEFAULT 'enterprise' NOT NULL,
	"scope_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dim_date" (
	"date_key" date PRIMARY KEY NOT NULL,
	"year" smallint NOT NULL,
	"quarter" smallint NOT NULL,
	"month" smallint NOT NULL,
	"week_of_year" smallint NOT NULL,
	"day_of_week" smallint NOT NULL,
	"day_of_month" smallint NOT NULL,
	"is_weekend" boolean NOT NULL,
	"month_name" varchar(10) NOT NULL,
	"day_name" varchar(10) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dim_enterprise" (
	"enterprise_id" integer PRIMARY KEY NOT NULL,
	"enterprise_slug" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dim_feature" (
	"feature_id" serial PRIMARY KEY NOT NULL,
	"feature_name" varchar(255) NOT NULL,
	"feature_category" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dim_feature_feature_name_unique" UNIQUE("feature_name")
);
--> statement-breakpoint
CREATE TABLE "dim_ide" (
	"ide_id" serial PRIMARY KEY NOT NULL,
	"ide_name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dim_ide_ide_name_unique" UNIQUE("ide_name")
);
--> statement-breakpoint
CREATE TABLE "dim_language" (
	"language_id" serial PRIMARY KEY NOT NULL,
	"language_name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dim_language_language_name_unique" UNIQUE("language_name")
);
--> statement-breakpoint
CREATE TABLE "dim_model" (
	"model_id" serial PRIMARY KEY NOT NULL,
	"model_name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dim_model_model_name_unique" UNIQUE("model_name")
);
--> statement-breakpoint
CREATE TABLE "dim_org" (
	"org_id" serial PRIMARY KEY NOT NULL,
	"org_name" varchar(255) NOT NULL,
	"enterprise_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dim_org_org_name_unique" UNIQUE("org_name")
);
--> statement-breakpoint
CREATE TABLE "dim_user" (
	"user_key" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"user_login" varchar(255) NOT NULL,
	"org_id" integer,
	"team_name" varchar(255),
	"effective_from" date DEFAULT now() NOT NULL,
	"effective_to" date DEFAULT '9999-12-31',
	"is_current" boolean DEFAULT true NOT NULL,
	"license_assigned_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact_cli_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"user_id" integer NOT NULL,
	"cli_version" varchar(50),
	"session_count" integer DEFAULT 0 NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"prompt_count" integer DEFAULT 0 NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact_copilot_usage_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"enterprise_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"user_login" varchar(255) NOT NULL,
	"org_id" integer,
	"user_initiated_interaction_count" integer DEFAULT 0 NOT NULL,
	"code_generation_activity_count" integer DEFAULT 0 NOT NULL,
	"code_acceptance_activity_count" integer DEFAULT 0 NOT NULL,
	"used_agent" boolean DEFAULT false NOT NULL,
	"used_chat" boolean DEFAULT false NOT NULL,
	"used_cli" boolean DEFAULT false NOT NULL,
	"loc_suggested_to_add_sum" integer DEFAULT 0 NOT NULL,
	"loc_suggested_to_delete_sum" integer DEFAULT 0 NOT NULL,
	"loc_added_sum" integer DEFAULT 0 NOT NULL,
	"loc_deleted_sum" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact_user_feature_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"user_id" integer NOT NULL,
	"feature_id" integer NOT NULL,
	"user_initiated_interaction_count" integer DEFAULT 0 NOT NULL,
	"code_generation_activity_count" integer DEFAULT 0 NOT NULL,
	"code_acceptance_activity_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact_user_ide_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"user_id" integer NOT NULL,
	"ide_id" integer NOT NULL,
	"user_initiated_interaction_count" integer DEFAULT 0 NOT NULL,
	"code_generation_activity_count" integer DEFAULT 0 NOT NULL,
	"code_acceptance_activity_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact_user_language_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"user_id" integer NOT NULL,
	"language_id" integer NOT NULL,
	"feature_id" integer NOT NULL,
	"user_initiated_interaction_count" integer DEFAULT 0 NOT NULL,
	"code_generation_activity_count" integer DEFAULT 0 NOT NULL,
	"code_acceptance_activity_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact_user_model_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"user_id" integer NOT NULL,
	"model_id" integer NOT NULL,
	"feature_id" integer NOT NULL,
	"user_initiated_interaction_count" integer DEFAULT 0 NOT NULL,
	"code_generation_activity_count" integer DEFAULT 0 NOT NULL,
	"code_acceptance_activity_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ingestion_date" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"records_fetched" integer DEFAULT 0,
	"records_inserted" integer DEFAULT 0,
	"error_message" text,
	"api_requests" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "raw_copilot_usage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"report_date" date NOT NULL,
	"enterprise_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"raw_json" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"filters_json" jsonb NOT NULL,
	"dashboard_path" varchar(255) NOT NULL,
	"created_by" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dim_org" ADD CONSTRAINT "dim_org_enterprise_id_dim_enterprise_enterprise_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."dim_enterprise"("enterprise_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dim_user" ADD CONSTRAINT "dim_user_org_id_dim_org_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."dim_org"("org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_copilot_usage_daily" ADD CONSTRAINT "fact_copilot_usage_daily_org_id_dim_org_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."dim_org"("org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_user_feature_daily" ADD CONSTRAINT "fact_user_feature_daily_feature_id_dim_feature_feature_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."dim_feature"("feature_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_user_ide_daily" ADD CONSTRAINT "fact_user_ide_daily_ide_id_dim_ide_ide_id_fk" FOREIGN KEY ("ide_id") REFERENCES "public"."dim_ide"("ide_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_user_language_daily" ADD CONSTRAINT "fact_user_language_daily_language_id_dim_language_language_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."dim_language"("language_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_user_language_daily" ADD CONSTRAINT "fact_user_language_daily_feature_id_dim_feature_feature_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."dim_feature"("feature_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_user_model_daily" ADD CONSTRAINT "fact_user_model_daily_model_id_dim_model_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."dim_model"("model_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_user_model_daily" ADD CONSTRAINT "fact_user_model_daily_feature_id_dim_feature_feature_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."dim_feature"("feature_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dim_user_user_id" ON "dim_user" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_fact_cli_unique" ON "fact_cli_daily" USING btree ("day","user_id","cli_version");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_fact_usage_unique" ON "fact_copilot_usage_daily" USING btree ("day","enterprise_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_fact_usage_day_org" ON "fact_copilot_usage_daily" USING btree ("day","org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_fact_feature_unique" ON "fact_user_feature_daily" USING btree ("day","user_id","feature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_fact_ide_unique" ON "fact_user_ide_daily" USING btree ("day","user_id","ide_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_fact_lang_unique" ON "fact_user_language_daily" USING btree ("day","user_id","language_id","feature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_fact_model_unique" ON "fact_user_model_daily" USING btree ("day","user_id","model_id","feature_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_raw_unique" ON "raw_copilot_usage" USING btree ("report_date","enterprise_id","user_id");