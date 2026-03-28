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
CREATE UNIQUE INDEX "idx_fact_cli_unique" ON "fact_cli_daily" USING btree ("day","user_id","cli_version");