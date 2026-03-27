---
description: "Use when modifying database schema, Drizzle ORM tables, star schema design, migrations, or ETL transformation logic."
applyTo: "app/src/lib/db/**/*.ts, app/src/lib/etl/**/*.ts"
---
# Database & ETL Conventions

## Star Schema

- Dimension tables: `dim_` prefix (`dim_user`, `dim_feature`, `dim_model`, `dim_language`)
- Fact tables: `fact_` prefix (`fact_copilot_usage_daily`, `fact_user_feature_daily`, etc.)
- Index names: `idx_` prefix
- Column names: `snake_case`
- `dim_user` is SCD Type 2 with `effective_from`, `effective_to`, `is_current`

## Schema Changes

1. Edit `app/src/lib/db/schema.ts`
2. Run `cd app && npm run db:generate`
3. Verify migration in `app/drizzle/`
4. Migrations run automatically on startup — do not add manual steps

## ETL Rules

- Use `onConflictDoUpdate` for all upserts
- Transform functions live in `app/src/lib/etl/transform.ts`
- Ingest orchestration in `app/src/lib/etl/ingest.ts`
- Log with `console.info` for success, `console.error` for failures
- Never use raw SQL — Drizzle ORM only
