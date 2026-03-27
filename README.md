# Copilot Insights

Enterprise analytics dashboard for **GitHub Copilot** usage, adoption, licensing, and AI model activity. Built with Next.js 15, React 19, TypeScript, and PostgreSQL.

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

| Page | Route | Description |
|---|---|---|
| **Copilot Usage** | `/metrics` | Daily/weekly active users, code completions, chat mode breakdown, model & language analytics |
| **Code Generation** | `/code-generation` | LOC added/deleted by user vs agent, breakdowns by feature, model, and language |
| **Agent Impact** | `/agents` | Agent adoption rate, acceptance rate, code generation comparison, top agent users |
| **Copilot Licensing** | `/seats` | Seat assignments, license utilization, plan distribution (live from GitHub API) |
| **Premium Requests** | `/premium-requests` | Premium model request consumption and budget tracking (live from GitHub API) |
| **Users** | `/users` | Individual user activity, engagement patterns, and feature adoption |
| **Models** | `/models` | AI model enablement status, usage volume, and feature breakdown |
| **Metrics Reference** | `/reference` | Complete metric definitions, calculation formulas, and data sources |

## Architecture

- **Frontend**: Next.js 15 App Router, React 19, Tailwind CSS 3, Chart.js
- **Backend**: Next.js API routes, Drizzle ORM 0.39
- **Database**: PostgreSQL 16 (star schema — dimensions + fact tables)
- **ETL**: Custom ingest pipeline with GitHub Copilot Usage Metrics API (v2026-03-10)
- **Infrastructure**: Azure Container Apps, Azure Database for PostgreSQL, Azure Container Registry, Key Vault

See [docs/architecture.md](docs/architecture.md) for detailed architecture documentation.

## Prerequisites

- **Node.js** 20+ and npm
- **PostgreSQL** 16+ (local or cloud)
- **GitHub Enterprise Cloud** with Copilot enabled
- **GitHub Personal Access Token** with `manage_billing:copilot` and `read:org` scopes

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/ghcp-dashboard.git
cd ghcp-dashboard

# 2. Install dependencies
cd app
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your database URL and GitHub token

# 4. Run database migrations
npx drizzle-kit migrate

# 5. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and navigate to **Settings** to configure your GitHub token and sync schedule.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GITHUB_TOKEN` | Yes | GitHub PAT with `manage_billing:copilot` and `read:org` |
| `GITHUB_ORG` | Yes | GitHub organization slug |
| `ADMIN_PASSWORD` | Yes | Password for Settings page access (min 8 chars) |
| `SYNC_INTERVAL_MINUTES` | No | Auto-sync interval (default: 360) |

## Deploy to Azure

This project includes Infrastructure as Code (Bicep) for Azure deployment via the [Azure Developer CLI](https://learn.microsoft.com/azure/developer/azure-developer-cli/).

```bash
# Install Azure Developer CLI if needed
# https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd

# Deploy everything (infrastructure + app)
azd up

# Subsequent deploys (app only)
azd deploy
```

Resources provisioned:
- Azure Container Apps (0.5 vCPU, 1 GiB, scale 0–3)
- Azure Database for PostgreSQL Flexible Server (B1ms, 32 GB)
- Azure Container Registry (Basic)
- Azure Key Vault (secrets for DB URL, GitHub token, admin password)
- Application Insights + Log Analytics

## Project Structure

```
ghcp-dashboard/
├── app/                          # Next.js application
│   ├── src/
│   │   ├── app/                  # Pages and API routes
│   │   │   ├── api/              # REST API endpoints
│   │   │   ├── metrics/          # Copilot Usage dashboard
│   │   │   ├── code-generation/  # Code generation report
│   │   │   ├── agents/           # Agent impact report
│   │   │   ├── seats/            # Licensing page
│   │   │   ├── premium-requests/ # Premium requests page
│   │   │   ├── users/            # User explorer
│   │   │   ├── models/           # Models & policies
│   │   │   ├── reference/        # Metrics reference
│   │   │   └── settings/         # Configuration & data sync
│   │   ├── components/           # Shared React components
│   │   ├── lib/                  # Database, ETL, utilities
│   │   └── types/                # TypeScript type definitions
│   ├── drizzle/                  # Database migrations
│   ├── public/                   # Static assets
│   ├── Dockerfile                # Multi-stage production build
│   └── package.json
├── infra/                        # Azure Bicep IaC
├── docs/                         # Documentation
└── azure.yaml                    # Azure Developer CLI config
```

## Scripts

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint check
npm run db:generate  # Generate Drizzle migrations
npm run db:migrate   # Run migrations
npm run db:push      # Push schema to DB
npm run ingest       # Manual data ingest
```

## Data Sync

The dashboard supports two sync modes:

1. **Auto-sync**: Background sync on a configurable interval (default: every 6 hours). Runs via `instrumentation.ts` on server startup.
2. **Manual sync**: Trigger from the Settings → Data Sync page via SSE streaming.

Both modes call the GitHub Copilot Usage Metrics API (v2026-03-10) and transform the data into a star schema for analytics queries.

## License

[MIT](LICENSE)
