CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"action" varchar(100) NOT NULL,
	"category" varchar(50) NOT NULL,
	"actor" varchar(255) DEFAULT 'system' NOT NULL,
	"details" jsonb,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_audit_log_category" ON "audit_log" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_audit_log_created_at" ON "audit_log" USING btree ("created_at");