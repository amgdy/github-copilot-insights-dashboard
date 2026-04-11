ALTER TABLE "ingestion_log" ADD COLUMN "records_skipped" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "raw_copilot_usage" ADD COLUMN "content_hash" varchar(64);