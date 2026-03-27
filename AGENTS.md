# AGENTS.md

Copilot Insights — enterprise analytics dashboard for GitHub Copilot usage data.

## Setup commands

```bash
cd app
npm install              # Install dependencies
npm run dev              # Development server (port 3000)
npm run build            # Production build (validates types + lint)
npm run db:generate      # Generate Drizzle migrations after schema changes
npm run db:migrate       # Run pending migrations
```

## Deploy

```bash
azd deploy               # Deploy app to Azure Container Apps
azd up                   # Full provision + deploy (first time)
```

## Project structure

```
app/                      # Next.js 15 application
  src/
    app/                  # Pages (App Router) + API routes (/api/*)
    components/           # Reusable React components
      layout/             # Sidebar, breadcrumb, report filters
      ui/                 # DataTable and shared UI
    lib/
      db/                 # Drizzle ORM: schema, connection, settings
      etl/                # ETL pipeline: ingest + transform
      github/             # GitHub API client (pagination, retry, rate limiting)
      utils/              # Model display names and helpers
    types/                # TypeScript type definitions
  drizzle/                # Generated SQL migration files
  public/                 # Static assets (favicon.ico, copilot-icon.svg)
infra/                    # Azure Bicep infrastructure-as-code
docs/                     # Architecture documentation (Mermaid diagrams)
.github/
  copilot-instructions.md # GitHub Copilot workspace instructions
  agents/                 # Copilot custom agent definitions
  instructions/           # File-specific Copilot instructions
```

## Tech stack

- Next.js 15 (App Router), React 19, TypeScript 5.7 (strict mode)
- PostgreSQL 16 with Drizzle ORM 0.39 (star schema)
- Chart.js 4 via react-chartjs-2 for visualizations
- Tailwind CSS 3 (no custom CSS files)
- Zod for all input validation
- Azure Container Apps, Key Vault, ACR, Application Insights
- GitHub Copilot Usage Metrics API v2026-03-10

## Code style

- TypeScript strict mode with path alias `@/*` → `./src/*`
- Use `import type` for type-only imports
- PascalCase for components/types, camelCase for functions, UPPER_SNAKE_CASE for constants
- snake_case for database columns; `dim_` prefix for dimensions, `fact_` for facts
- Tailwind CSS only — use `cn()` utility (clsx + tailwind-merge) for conditional classes
- Icons from `lucide-react`, images via `next/image`
- LF line endings enforced via `.gitattributes`

## Logging

Use structured console methods — never `console.log`:

```typescript
console.info("Operation completed successfully");
console.warn("Rate limited. Retrying...");
console.error("Failed to fetch data:", error);
```

## API routes

- All routes under `app/src/app/api/` use Zod for query param validation
- Date format always `YYYY-MM-DD`, validated with `isValidDate()` from `@/lib/utils`
- Wrap handlers in try-catch, return `{ error: "Internal server error" }` on failure
- Use Drizzle ORM for all queries — no raw SQL strings
- Never leak stack traces or internal details in error responses

## Database

- Star schema: dimension tables (`dim_user`, `dim_feature`, `dim_model`, `dim_language`) + fact tables
- `dim_user` follows SCD Type 2 with `effective_from`, `effective_to`, `is_current`
- Schema defined in `app/src/lib/db/schema.ts`
- After schema changes: run `cd app && npm run db:generate`, commit the migration file
- Migrations run automatically on app startup via `instrumentation.ts`
- Use `onConflictDoUpdate` for ETL upserts

## Components

- Server Components by default — add `"use client"` only when state/effects are needed
- Dashboard pages: `ReportFilters` for date range + user filter, `DataTable` for tabular data
- Charts: `react-chartjs-2` wrappers (`Line`, `Bar`, `Doughnut`)

## Docker

Next.js standalone output mode — the Dockerfile runner stage must explicitly copy:
- `.next/standalone`, `.next/static`, `public/`, `drizzle/`

## Security

- All secrets in Azure Key Vault — never in env vars, parameters, or code
- Validate all user input with Zod at API boundaries
- No raw SQL — Drizzle ORM parameterized queries only
- Admin password gate on Settings page
- Managed Identity for Azure resource access

## Testing

Run `cd app && npm run build` before any PR — this validates TypeScript types and linting.
