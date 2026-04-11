# Changelog

All notable changes to **Copilot Insights Dashboard** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.8.0] — 2026-04-12

### Added

- **PR & Autofix dashboard** — new page at `/pull-requests` with AI-assisted PR creation, Copilot code review suggestions, autofix analytics, and merge metrics; includes 12 KPIs, 7 charts (PR Activity, Copilot Impact, TTM, Copilot vs Standard donut, Copilot Review Activity, Suggestions Over Time, Suggestion Outcome), and org breakdown table with autofix columns
- **PR & Autofix landing card** — added to home page grid with i18n support (en/ar/es/fr)
- **PR & Autofix API route** — `/api/metrics/pull-requests` endpoint with totals, daily breakdown, and org-level aggregation for PR creation, merge, Copilot code review, and autofix data
- **IDE Agent vs GitHub Coding Agent** — new card on Agent Impact page distinguishing IDE agent mode from GitHub cloud coding agent; tracks users, interactions, and requests separately
- **`used_copilot_coding_agent` field** — added through the full pipeline (types → schema → transform → ingest → DB migration) to track GitHub Coding Agent usage
- **ConfigurationBanner component** — shown on all dashboard pages when GitHub token or enterprise slug is missing
- **Internationalization (i18n)** — full 4-language support (English, Arabic RTL, Spanish, French) via `LocaleProvider` + `useTranslation()` hook with dot-path keys and template placeholders; ~200 translation keys per language covering all pages, KPIs, charts, tables, and navigation
- **Dark/Light/System theme** — three-mode theme system via `ThemeProvider` with localStorage persistence, `dark:` Tailwind variants, and `useChartOptions()` hook for theme-aware Chart.js visuals
- **Enterprise users API** — `/api/users` endpoint merging synced usage data with live GitHub license API
- **CLI metrics page** — `/cli` dashboard with session/request volumes, token consumption, version distribution, and CLI vs non-CLI productivity comparison
- **Model display names** — utility mapping raw model IDs to human-readable names and tier classification
- **Ingestion log download** — API endpoint to download sync history logs by ID
- **Audit log** — `/settings/audit-log` page with admin action tracking; `/api/audit-log` endpoint
- **Dashboard auth gate** — optional password protection for all dashboard pages via `/api/auth/verify-dashboard`
- **Organization discovery** — `/api/settings/orgs` endpoint to discover GitHub organizations
- **PDF export** — one-click PDF generation for all dashboard pages via `PdfButton` component
- **Empty state component** — reusable component shown when no data is available
- **Loading spinner component** — reusable loading state with customizable message
- **Multi-select component** — reusable searchable multi-select dropdown
- **Edge-compatible proxy** — middleware proxy with HMAC verification for secure API routing
- **Metrics Reference expanded** — 200+ metric definitions covering all dashboards including PR & Autofix, with page filter dropdown and search
- **Database schema expanded** — added `dim_date`, `dim_enterprise`, `dim_org`, `dim_ide`, `fact_user_ide_daily`, `fact_cli_daily`, `fact_org_aggregate_daily`, `saved_views`, `alert_rules`, `audit_log` tables (22 tables total)
- **SECURITY.md** — detailed vulnerability reporting guidelines and security practices
- **Development environment** — Docker Compose setup and CI/CD workflows with Trivy scanning

### Changed

- **GitHub API version unified** — all endpoints now use `2026-03-10` (was mixed versions); settings page API table updated accordingly
- **Active Users card redesigned** — improved layout and data presentation on the Copilot Usage dashboard
- **Drizzle ORM upgraded** to 1.0.0-beta.21 with updated schema and migration workflow
- **Package upgrades** — 7 packages updated to latest versions (Next.js 16.2, React 19.2, TypeScript 6.0, Tailwind CSS 4.2, Zod 4.3, Chart.js 4.5)
- **PostgreSQL version** updated to 18 across documentation and infrastructure
- **Shadow styling** — cards and KPI components use `shadow-xs` for a lighter appearance
- **Settings page refactored** — removed sync interval management, added info section, added audit log tab
- **GitHub token/slug** — removed from environment variable usage, stored securely in database only
- **Agent Impact page** — added IDE Agent vs GitHub Coding Agent card; moved Copilot PR metrics to dedicated PR & Autofix page

### Fixed

- **Comprehensive dark mode audit** — fixed 50+ dark mode violations across 8 files:
  - `data-sync/page.tsx`: Fixed all badges (SOURCE_LABELS, SCOPE_LABELS, STATUS_STYLES), info banners, form controls (checkboxes, radio buttons, dropdowns, inputs), file upload dropzone, confirmation dialogs, sync history table (headers, rows, expanded details, pagination), database management section, and reset dialog
  - `settings/page.tsx`: Fixed "Configured" badges, "Current token" text, delete buttons, and external link colors
  - `seats/page.tsx`: Fixed error block, subtitle, org filter, savings banner, cost summary table, and org list text colors
  - `premium-requests/page.tsx`: Fixed subtitle, quota allocation table, model breakdown table dividers and hover states
  - `users/page.tsx`: Fixed license badges, filter count badge, and "Clear all filters" link
  - `models/page.tsx`: Fixed "Total Requests" KPI color and tier badges (premium/included)
  - `page.tsx` (landing): Fixed card title hover color and Settings link hover color
- **Duplicate dark classes** — removed conflicting `dark:text-gray-400 dark:text-gray-500` patterns
- **Settings page API version** — corrected `2022-11-28` → `2026-03-10` in the GitHub APIs Used table
- **Security audit** — resolved 14 npm vulnerabilities

## [0.7.0] — 2026-03-29

### Added

- **Copilot Usage dashboard** (`/metrics`) — daily/weekly active users, code completions, chat requests, model usage trends
- **Code Generation dashboard** (`/code-generation`) — lines added/deleted across modes, models, and languages
- **Agent Impact dashboard** (`/agents`) — Copilot agent adoption and productivity metrics
- **Copilot Licensing dashboard** (`/seats`) — seat assignments, utilization, plan distribution, cost analysis, savings opportunities
- **Premium Requests dashboard** (`/premium-requests`) — premium model request consumption, overage detection, per-user/model breakdown
- **Users dashboard** (`/users`) — individual user activity, engagement patterns, feature adoption with advanced filters
- **Models dashboard** (`/models`) — AI model inventory, usage volume, feature breakdown, tier classification
- **Metrics Reference** (`/reference`) — comprehensive metric definitions and documentation
- **Settings pages** — configuration tab (GitHub token, enterprise slug, API reference) and data sync tab (manual/scheduled sync, file upload, sync history, database reset)
- **Landing page** — hero section with 8 section cards linking to all dashboards
- **Star schema database** — dimension tables (`dim_user`, `dim_feature`, `dim_model`, `dim_language`) + fact tables optimized for analytics
- **ETL pipeline** — GitHub API ingestion → transformation → PostgreSQL with SCD Type 2 for users
- **Scheduled sync** — configurable auto-sync with cron-based scheduling
- **File upload ingestion** — manual JSON data upload as alternative to API sync
- **PDF export** — one-click PDF generation for all dashboard pages
- **Responsive sidebar** — collapsible navigation with all dashboard links
- **Report filters** — reusable date range and user filter component
- **DataTable component** — sortable, searchable, paginated table with PDF-friendly rendering
- **Azure infrastructure** — Bicep IaC for Container Apps, Key Vault, ACR, PostgreSQL, Application Insights
- **Docker support** — standalone Next.js output mode with multi-stage Dockerfile
- **Architecture docs** — Mermaid diagrams covering system design, data flow, and schema

## [0.1.0] — 2026-03-27

- Initial commit — project scaffolding and core framework setup
