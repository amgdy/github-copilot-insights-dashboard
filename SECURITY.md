# Security Policy

## Supported Versions

Only the latest release on the `main` branch is actively supported with security updates. Previous versions do not receive patches.

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < Latest | :x:               |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report privately using the **"Report a vulnerability"** button on the [Security tab](https://github.com/amgdy/github-copilot-insights-dashboard/security) of this repository. This uses GitHub's built-in private vulnerability reporting, which creates a confidential advisory visible only to maintainers and the reporter.

When reporting, please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce the issue
- Affected components (e.g., API routes, ETL pipeline, database, infrastructure)
- Any suggested remediation if known

## Response Timeline

- **Acknowledgement**: Within 48 hours of report submission
- **Initial assessment**: Within 5 business days
- **Resolution target**: Critical vulnerabilities within 14 days; others within 30 days

You will receive updates as the issue is triaged and resolved. If the vulnerability is accepted, we will coordinate disclosure timing with you.

## Security Practices

This project follows these security practices:

- **Input validation**: All API inputs are validated with [Zod](https://zod.dev/) at the boundary
- **Parameterized queries**: [Drizzle ORM](https://orm.drizzle.team/) is used for all database access — no raw SQL
- **Secret management**: All secrets are stored in Azure Key Vault, never in environment variables or code
- **Container scanning**: Docker images are scanned with [Trivy](https://trivy.dev/) on every CI run
- **Dependency monitoring**: GitHub Dependabot is enabled for automated dependency updates
- **Least privilege**: Managed Identity with minimal role assignments for Azure resource access
- **Network restrictions**: PostgreSQL firewall allows Azure services only

## Scope

The following are in scope for security reports:

- API route authentication and authorization bypasses
- SQL injection or ORM misuse
- Secret leakage in logs, responses, or client bundles
- Cross-site scripting (XSS) in dashboard pages
- Server-side request forgery (SSRF)
- Insecure infrastructure configuration (Bicep/Dockerfile)
- Dependency vulnerabilities with a known exploit

The following are out of scope:

- Denial of service attacks
- Social engineering
- Issues in third-party services (GitHub API, Azure platform)
- Reports from automated scanners without a demonstrated impact
