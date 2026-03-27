ALTER TABLE "dim_model" ADD COLUMN IF NOT EXISTS "display_name" varchar(255);--> statement-breakpoint
ALTER TABLE "dim_model" ADD COLUMN IF NOT EXISTS "is_premium" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dim_model" ADD COLUMN IF NOT EXISTS "is_enabled" boolean;--> statement-breakpoint
-- Seed known Copilot models with display names, tier classification, and enablement
INSERT INTO "dim_model" ("model_name", "display_name", "is_premium", "is_enabled") VALUES
  ('gpt-3.5-turbo',     'GPT-3.5 Turbo',       false, true),
  ('gpt-4',             'GPT-4',               true,  true),
  ('gpt-4-turbo',       'GPT-4 Turbo',         true,  true),
  ('gpt-4o',            'GPT-4o',              false, true),
  ('gpt-4o-mini',       'GPT-4o Mini',         false, true),
  ('gpt-4.1',           'GPT-4.1',             true,  true),
  ('gpt-4.1-mini',      'GPT-4.1 Mini',        false, true),
  ('gpt-4.1-nano',      'GPT-4.1 Nano',        false, true),
  ('o1',                'o1',                  true,  true),
  ('o1-mini',           'o1 Mini',             true,  true),
  ('o1-preview',        'o1 Preview',          true,  true),
  ('o3',                'o3',                  true,  true),
  ('o3-mini',           'o3 Mini',             true,  true),
  ('o4-mini',           'o4 Mini',             true,  true),
  ('claude-3.5-sonnet', 'Claude 3.5 Sonnet',   true,  true),
  ('claude-3.5-haiku',  'Claude 3.5 Haiku',    false, true),
  ('claude-4.0-sonnet', 'Claude 4.0 Sonnet',   true,  true),
  ('claude-4.6-sonnet', 'Claude 4.6 Sonnet',   true,  true),
  ('claude-opus-4.6',   'Claude Opus 4.6',     true,  true),
  ('gemini-1.5-pro',    'Gemini 1.5 Pro',      true,  true),
  ('gemini-1.5-flash',  'Gemini 1.5 Flash',    false, true),
  ('gemini-2.0-flash',  'Gemini 2.0 Flash',    false, true),
  ('gemini-2.5-pro',    'Gemini 2.5 Pro',      true,  true),
  ('default',           'Default',             false, true),
  ('copilot-default',   'Copilot Default',     false, true)
ON CONFLICT ("model_name") DO UPDATE SET
  "display_name" = EXCLUDED."display_name",
  "is_premium" = EXCLUDED."is_premium",
  "is_enabled" = EXCLUDED."is_enabled";