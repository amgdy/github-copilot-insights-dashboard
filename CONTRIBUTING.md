# Contributing to Copilot Insights

Thank you for your interest in contributing! Here's how to get started.

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `cd app && npm install`
3. Copy `app/.env.example` to `app/.env` and configure
4. Start PostgreSQL and run migrations: `npx drizzle-kit migrate`
5. Start the dev server: `npm run dev`

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear, descriptive commits
3. Ensure the build passes: `npm run build`
4. Update documentation if adding new features or pages
5. Open a pull request with a description of what changed and why

## Code Style

- **TypeScript** for all source files
- **Tailwind CSS** for styling (no custom CSS unless necessary)
- **Server Components** by default; use `"use client"` only when needed
- Follow existing patterns for API routes (zod validation, error handling)
- Use `console.error` for error logging in API routes

## Database Changes

- Use Drizzle ORM schema definitions in `app/src/lib/db/schema.ts`
- Generate migrations: `npm run db:generate`
- Never edit migration files directly after they've been committed

## Adding a New Dashboard Page

1. Create a page under `app/src/app/<route>/page.tsx`
2. Create an API route under `app/src/app/api/metrics/<name>/route.ts`
3. Add the page to the sidebar in `app/src/components/layout/sidebar.tsx`
4. Add the page to the landing page sections in `app/src/app/page.tsx`
5. Add metric definitions to the reference page at `app/src/app/reference/page.tsx`

## Reporting Issues

Open an issue with:
- Clear description of the problem or feature request
- Steps to reproduce (for bugs)
- Expected vs actual behavior
