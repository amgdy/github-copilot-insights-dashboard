---
description: "Use when modifying Azure Bicep templates, Dockerfile, deployment configuration, or infrastructure-as-code."
applyTo: "infra/**/*.bicep, app/Dockerfile, azure.yaml"
---
# Infrastructure Conventions

## Bicep

- Entry point: `infra/main.bicep` (subscription-level)
- Resources: `infra/resources.bicep`
- All secrets in Azure Key Vault — never in parameters or environment variables
- Use Managed Identity for RBAC-based access
- Do not hardcode resource names

## Dockerfile

Next.js standalone output requires explicit COPY for these directories in the runner stage:
- `.next/standalone` — Server bundle
- `.next/static` — Static assets
- `public/` — Favicon and static files
- `drizzle/` — Migration SQL files

## Deployment

- `azd up` for full provision + deploy
- `azd deploy` for app-only deploy
- Always run `cd app && npm run build` before deploying to catch errors early
