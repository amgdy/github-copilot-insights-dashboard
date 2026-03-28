# Architecture

Copilot Insights is an enterprise analytics dashboard for GitHub Copilot usage data. This document describes the system architecture, data flow, and key components.

## System Overview

```mermaid
graph TD
    subgraph ACA["Azure Container Apps"]
        subgraph App["Next.js 15 Application"]
            React["React 19 Pages<br/>(App Router)"]
            API["API Routes<br/>/api/*"]
            ETL["ETL Pipeline<br/>(ingest + transform)"]
        end
    end

    React -- "fetch()" --> API
    API -- "Drizzle ORM" --> PG
    ETL -- "GitHub API v2026-03-10" --> GH

    PG[("PostgreSQL 16<br/>Star Schema<br/>Azure Flexible Server")]
    GH["GitHub REST API<br/>api.github.com<br/>• Usage Metrics<br/>• Billing / Seats<br/>• Premium Requests"]
```

## Component Architecture

### Frontend (React 19 + Next.js App Router)

All dashboard pages are client components using `"use client"` that fetch data from internal API routes. Chart rendering uses `react-chartjs-2` (Chart.js 4).

| Component | Purpose |
|---|---|
| `components/layout/sidebar.tsx` | Main navigation sidebar |
| `components/layout/report-filters.tsx` | Shared date range picker + searchable user filter |
| `components/layout/breadcrumb.tsx` | Page breadcrumb navigation |
| `components/ui/data-table.tsx` | Sortable, paginated data table |

### API Layer (Next.js Route Handlers)

All API routes live under `app/src/app/api/` and use Zod for request validation.

| Route | Method | Description |
|---|---|---|
| `/api/metrics/dashboard` | GET | Main usage metrics (active users, completions, models, languages) |
| `/api/metrics/code-generation` | GET | LOC breakdown by feature, model, language |
| `/api/metrics/agents` | GET | Agent adoption, acceptance, code generation |
| `/api/metrics/models` | GET | Model catalog with usage stats |
| `/api/metrics/seats` | GET | Live seat data from GitHub Billing API |
| `/api/metrics/premium-requests` | GET | Live premium request data from GitHub API |
| `/api/users` | GET | User-level activity data |
| `/api/filters` | GET | Available filter options (user list) |
| `/api/data-range` | GET | Ingested data date range for banners |
| `/api/ingest` | POST | Trigger data ingest |
| `/api/ingest/stream` | GET | SSE streaming ingest with progress |
| `/api/ingest/upload` | POST | Upload JSON data manually |
| `/api/settings` | GET/POST | Application settings CRUD |
| `/api/settings/sync-history` | GET | Sync history log |
| `/api/settings/sync-interval` | GET/POST | Background sync interval config |
| `/api/auth/verify-admin` | POST | Admin password verification |
| `/api/admin/reset` | POST | Database reset |

### ETL Pipeline

The ingest pipeline runs in two modes:

1. **Background Auto-Sync** — A `setInterval` in `instrumentation.ts` (Next.js `register()` hook) fires on a configurable interval.
2. **Manual Sync** — Triggered from the Settings page via Server-Sent Events for real-time progress.

```mermaid
graph TD
    A["GitHub Copilot Usage Metrics API<br/>(v2026-03-10)"] --> B["copilot-api.ts<br/>Fetches raw JSON from GitHub"]
    B --> C["ingest.ts<br/>Orchestrates the sync process"]
    C --> D["transform.ts<br/>Transforms API response → star schema rows"]
    D --> E[("PostgreSQL<br/>Upserts into dimensions + fact tables")]
```

**Key files:**
- `lib/github/copilot-api.ts` — GitHub API client with pagination and rate limiting
- `lib/etl/ingest.ts` — Main ingest orchestration
- `lib/etl/transform.ts` — Data transformation to star schema format
- `lib/github/resolve-display-names.ts` — Resolves GitHub login → display name mapping

## Database Schema

The database follows a **star schema** design optimized for analytics queries.

### Dimension Tables

| Table | Description |
|---|---|
| `dim_user` | SCD Type 2 user dimension (login, display name, team, org) |
| `dim_feature` | Copilot feature/mode dimension (chat, agent, code_completion, etc.) |
| `dim_model` | AI model dimension (GPT-4, Claude, Gemini, + display name, premium flag) |
| `dim_language` | Programming language dimension |

### Fact Tables

| Table | Description |
|---|---|
| `fact_copilot_usage_daily` | One row per user per day — core metrics (interactions, code gen, LOC, mode flags) |
| `fact_user_feature_daily` | One row per user per feature per day |
| `fact_user_model_daily` | One row per user per model per feature per day |
| `fact_user_language_daily` | One row per user per language per day |
| `fact_user_language_model_daily` | One row per user per language per model per day |

### Supporting Tables

| Table | Description |
|---|---|
| `raw_copilot_usage` | Raw API response stored as JSONB (for code generation report) |
| `ingestion_log` | Sync history with timestamps and status |
| `settings` | Key-value application settings |

### ER Diagram

```mermaid
erDiagram
    dim_user ||--o{ fact_copilot_usage_daily : "user_key"
    dim_feature ||--o{ fact_copilot_usage_daily : "feature_key"
    dim_model ||--o{ fact_copilot_usage_daily : "model_key"

    fact_copilot_usage_daily ||--o{ fact_user_feature_daily : "usage_key"
    fact_copilot_usage_daily ||--o{ fact_user_model_daily : "usage_key"
    fact_copilot_usage_daily ||--o{ fact_user_language_daily : "usage_key"

    dim_language ||--o{ fact_user_language_daily : "language_key"
    fact_user_language_daily ||--o{ fact_user_language_model_daily : "language_key"

    dim_user {
        int user_key PK
        string login
        string display_name
        string team
        string org
    }

    dim_feature {
        int feature_key PK
        string feature_name
    }

    dim_model {
        int model_key PK
        string model_name
        boolean is_premium
    }

    dim_language {
        int language_key PK
        string language_name
    }

    fact_copilot_usage_daily {
        int usage_key PK
        date date
        int interactions
        int code_gen
        int loc
    }

    fact_user_feature_daily {
        int user_key FK
        int feature_key FK
        date date
    }

    fact_user_model_daily {
        int user_key FK
        int model_key FK
        date date
    }

    fact_user_language_daily {
        int user_key FK
        int language_key FK
        date date
    }

    fact_user_language_model_daily {
        int user_key FK
        int language_key FK
        int model_key FK
        date date
    }
```

## Infrastructure (Azure)

Deployed via Azure Developer CLI (`azd`) with Bicep templates.

### Resources

| Resource | SKU | Purpose |
|---|---|---|
| **Container App** | 0.5 vCPU / 1 GiB / scale 0–3 | Hosts the Next.js application |
| **Container App Environment** | — | Managed environment with Log Analytics |
| **PostgreSQL Flexible Server** | B1ms / 32 GB | Relational database |
| **Container Registry** | Basic | Docker image registry |
| **Key Vault** | RBAC | Stores DATABASE_URL, ADMIN_PASSWORD |
| **Application Insights** | — | APM and telemetry |
| **Log Analytics Workspace** | — | Centralized logging |
| **Managed Identity** | User-assigned | RBAC for ACR pull + Key Vault access |

### Deployment Flow

```mermaid
graph TD
    A["azd up"] --> B["infra/main.bicep<br/>Creates resource group"]
    B --> C["infra/resources.bicep<br/>Provisions all Azure resources"]
    A --> D["app/Dockerfile<br/>Multi-stage build<br/>(deps → build → runner)"]
    D --> E["Deployed to Container Apps via ACR"]
```

### Security

- All secrets stored in **Azure Key Vault** (not environment variables)
- Container App uses **Managed Identity** for RBAC-based access to ACR and Key Vault
- PostgreSQL firewall allows only Azure services
- Admin settings page protected by password gate
- No public database access

## Data Flow

### Ingested Data (Copilot Usage, Agents, Code Generation)

```mermaid
graph LR
    A["GitHub API"] --> B["ingest.ts"] --> C["transform.ts"] --> D[("PostgreSQL<br/>fact/dim tables")]
    D --> E["API routes<br/>Drizzle ORM + SQL"]
    E --> F["React pages<br/>fetch() + Chart.js"]
```

### Live Data (Seats, Premium Requests)

```mermaid
graph LR
    A["React page"] --> B["API route"] --> C["GitHub REST API<br/>(direct proxy)"]
    C --> D["Response formatted<br/>and returned to client"]
```

Seats and Premium Requests pages call GitHub APIs directly on each request (no database caching) to ensure real-time data. These pages display a "Live from GitHub API" data source banner.

## Configuration

Application settings are stored in the `settings` database table and managed through the Settings UI:

| Setting | Description |
|---|---|
| GitHub Token | PAT for API access |
| GitHub Organization | Org slug for API queries |
| Admin Password | Password for settings access |
| Sync Interval | Auto-sync frequency in minutes |

The Settings page has two tabs:
1. **Configuration** — Token, org, password management
2. **Data Sync** — Manual sync trigger, sync history, interval config
