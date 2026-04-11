# Project Guidelines

## Overview

Copilot Insights — enterprise analytics dashboard for GitHub Copilot usage data.
Tech stack: Next.js 16.2 (App Router), React 19.2, TypeScript 6.0, PostgreSQL 18, Drizzle ORM 0.45, Chart.js 4.5, Tailwind CSS 4.2, Zod 4.3.
Deployed on Azure Container Apps via `azd`. Infrastructure defined in Bicep (`infra/`).

## Architecture

See [docs/architecture.md](../docs/architecture.md) for system diagrams, data flow, and schema details.

- **Star schema** database: dimension tables (`dim_*`) + fact tables (`fact_*`) optimized for analytics
- **ETL pipeline**: `lib/github/copilot-api.ts` → `lib/etl/ingest.ts` → `lib/etl/transform.ts` → PostgreSQL
- **GitHub API version**: `2026-03-10` (all endpoints — Copilot Usage Metrics, org listing, members)
- **Theme system**: light/dark/system via `ThemeProvider` + Tailwind `class` strategy
- **Internationalization**: 4 languages (en/ar/es/fr) via `LocaleProvider` + `useTranslation()` hook
- **Server Components** by default; `"use client"` only when state/effects are needed
- **API routes** under `app/src/app/api/` with Zod validation on all query params
- **Standalone output** mode for Docker — `public/` and `drizzle/` must be explicitly copied in Dockerfile

## Code Style

### TypeScript

- Strict mode enabled. Path alias: `@/*` → `./src/*`
- Use `import type` for type-only imports
- Prefer `interface` for object shapes, `type` for unions/intersections
- Use `const` assertions and `satisfies` where appropriate

### Naming

- **PascalCase**: React components, types, interfaces
- **camelCase**: functions, variables, hooks
- **UPPER_SNAKE_CASE**: constants (`COLORS`, `MAX_RETRIES`, `API_VERSION`)
- **snake_case**: database column names (`user_login`, `feature_id`, `is_current`)
- **Prefixes**: `dim_` (dimensions), `fact_` (facts), `raw_` (raw data), `idx_` (indexes)

### Imports

```typescript
// Next.js / React
import type { Metadata } from "next";
import { NextRequest, NextResponse } from "next/server";
import { useState, useCallback, useMemo } from "react";

// Path aliases
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

// Libraries
import { z } from "zod";
import { sql, and, gte, lte, eq, inArray } from "drizzle-orm";
```

### Logging

Use structured console methods — not `console.log`:

```typescript
console.info("Database migrations completed successfully");
console.warn(`Rate limited. Waiting ${waitMs}ms before retry`);
console.error("Failed to fetch data:", error);
```

### Error Handling

API routes: wrap in try-catch, log with `console.error`, return generic error response:

```typescript
try {
  // business logic
  return NextResponse.json(data);
} catch (error) {
  console.error("Failed to fetch data:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
```

### CSS

Tailwind CSS only — no custom CSS files. Use `cn()` utility (clsx + tailwind-merge) for conditional classes:

```typescript
className={cn(
  "flex items-center px-3 py-2 text-sm",
  isActive ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
)}
```

## Conventions

### API Routes

All API routes use Zod for query param validation with proper coercion:

```typescript
const querySchema = z.object({
  days: z.coerce.number().int().positive().optional(),
  start: z.string().refine(isValidDate).optional(),
  end: z.string().refine(isValidDate).optional(),
  userId: z.coerce.number().int().optional(),
});
```

Date format is always `YYYY-MM-DD`. Use `isValidDate()` from `@/lib/utils` for validation.

### Database

- Drizzle ORM for all queries — no raw SQL strings
- Schema defined in `app/src/lib/db/schema.ts`
- Migrations generated with `npm run db:generate` → stored in `app/drizzle/`
- Migrations run automatically on app startup via `instrumentation.ts`
- Use `onConflictDoUpdate` for upserts in ETL

### Components

- Server Components by default (no directive needed)
- Add `"use client"` only for components using `useState`, `useEffect`, or browser APIs
- Charts: `react-chartjs-2` wrappers (`Line`, `Bar`, `Doughnut`) with Chart.js 4
- Use `useChartOptions()` from `@/lib/theme/chart-theme` for theme-aware Chart.js options
- Reusable layout components in `components/layout/`
- Use `next/image` for images, `lucide-react` for icons

### Pages

Dashboard pages follow a consistent pattern:
1. `"use client"` directive
2. `const { t } = useTranslation()` for i18n strings
3. `const { commonOptions, doughnutOptions, legendPreset } = useChartOptions()` for theme-aware charts
4. `ReportFilters` component for date range + user filter
5. `fetch()` to internal API routes with filter params
6. Chart.js visualizations + `DataTable` for tabular data
7. Loading skeleton states while data fetches
8. All user-visible strings use `t()` calls — no hardcoded text

### Theme (Dark Mode)

- Three modes: light, dark, system — toggled via sidebar
- `ThemeProvider` in `app/src/lib/theme/theme-provider.tsx` manages state via localStorage
- Tailwind `class` strategy: `html.dark` class toggles dark mode
- All components use `dark:` Tailwind variants for dark mode styling
- Charts use `useChartOptions()` hook for theme-aware options (grid, text, tooltip colors)
- `useTheme()` returns `{ theme, setTheme, resolvedTheme }`

### Internationalization (i18n)

- Four languages: English, Arabic (RTL), Spanish, French
- `LocaleProvider` in `app/src/lib/i18n/locale-provider.tsx` manages locale via localStorage
- Translations in `app/src/lib/i18n/translations/{en,ar,es,fr}.ts`
- Access via `useTranslation()` hook: `const { t } = useTranslation()`
- Keys use dot-path notation: `t("dashboard.activeUsers")`
- Template placeholders: `t("dashboard.ofTotal", count)` → replaces `{0}`
- All page titles, subtitles, KPI labels, chart titles, and table headers use `t()` calls
- TypeScript type safety: `TranslationKeys` type exported from `en.ts`

## Build and Test

```bash
cd app
npm install              # Install dependencies
npm run dev              # Development server (port 3000)
npm run build            # Production build (validates types + lint)
npm run db:generate      # Generate Drizzle migrations after schema changes
npm run db:migrate       # Run pending migrations
```

Deploy: `azd deploy` from repo root. Full provision: `azd up`.

## Security

- All secrets in Azure Key Vault — never in environment variables or code
- Admin password gate on Settings page (`/api/auth/verify-admin`)
- PostgreSQL firewall: Azure services only
- Managed Identity for ACR pull + Key Vault access
- Validate all user input with Zod at API boundaries
- No raw SQL — use Drizzle ORM parameterized queries

## File Conventions

- LF line endings enforced (`.gitattributes`)
- UTF-8 encoding, no BOM
