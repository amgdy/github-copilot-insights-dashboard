CREATE TABLE "fact_user_language_model_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"user_id" integer NOT NULL,
	"language_id" integer NOT NULL,
	"model_id" integer NOT NULL,
	"code_generation_activity_count" integer DEFAULT 0 NOT NULL,
	"code_acceptance_activity_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fact_user_language_model_daily" ADD CONSTRAINT "fact_user_language_model_daily_language_id_dim_language_language_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."dim_language"("language_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_user_language_model_daily" ADD CONSTRAINT "fact_user_language_model_daily_model_id_dim_model_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."dim_model"("model_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_fact_lang_model_unique" ON "fact_user_language_model_daily" USING btree ("day","user_id","language_id","model_id");