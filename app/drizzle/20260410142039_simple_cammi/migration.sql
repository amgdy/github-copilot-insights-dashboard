ALTER TABLE "ingestion_log" ADD COLUMN "scope" varchar(30) DEFAULT 'enterprise';--> statement-breakpoint
ALTER TABLE "ingestion_log" ADD COLUMN "scope_detail" varchar(500);