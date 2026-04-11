---
description: "Use when creating or modifying React components, dashboard pages, Chart.js visualizations, or Tailwind CSS styling."
applyTo: "app/src/app/**/page.tsx, app/src/components/**/*.tsx"
---
# Component & Page Conventions

## Server vs Client Components

- Server Components are the default — no directive needed
- Add `"use client"` ONLY when the component uses `useState`, `useEffect`, `useCallback`, or browser APIs
- All dashboard report pages are client components (they fetch data and render charts)

## Dashboard Page Pattern

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { useChartOptions } from "@/lib/theme/chart-theme";
import { ReportFilters, type FilterState } from "@/components/layout/report-filters";
import { DataTable } from "@/components/ui/data-table";
import { Line, Bar, Doughnut } from "react-chartjs-2";

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function MyPage() {
  const { t } = useTranslation();
  const { commonOptions, doughnutOptions, legendPreset } = useChartOptions();
  const [data, setData] = useState<MyData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (filters: FilterState) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.startDate) params.set("start", filters.startDate);
    if (filters.endDate) params.set("end", filters.endDate);
    if (filters.userId) params.set("userId", filters.userId);
    const res = await fetch(`/api/metrics/my-endpoint?${params}`);
    setData(await res.json());
    setLoading(false);
  }, []);

  return (
    <div className="space-y-6">
      <h1>{t("myPage.title")}</h1>
      <ReportFilters onApply={fetchData} />
      {loading ? <Skeleton /> : <Charts data={data} />}
    </div>
  );
}
```

## Styling

- Tailwind CSS only — no custom CSS files
- Use `cn()` from `@/lib/utils` for conditional classes
- Icons from `lucide-react`
- Images via `next/image`
- All components use `dark:` Tailwind variants for dark mode styling
- Example: `className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"`

## Theme (Dark Mode)

- Three modes: light, dark, system — toggled via sidebar
- `ThemeProvider` wraps the app in `layout.tsx`
- `useTheme()` from `@/lib/theme/theme-provider` returns `{ theme, setTheme, resolvedTheme }`
- Charts must use `useChartOptions()` from `@/lib/theme/chart-theme` for theme-aware options
- `useChartOptions()` returns `{ commonOptions, doughnutOptions, legendPreset, isDark }`
- Pass `commonOptions` to `<Line>` and `<Bar>` components, `doughnutOptions` to `<Doughnut>`
- Never hardcode Chart.js colors for grid, text, or tooltips — use the hook

## Internationalization (i18n)

- All user-visible strings must use `t()` calls — no hardcoded text
- Import `useTranslation` from `@/lib/i18n/locale-provider`
- Call `const { t } = useTranslation()` at the top of the component
- Keys use dot-path notation: `t("dashboard.activeUsers")`
- Template placeholders: `t("dashboard.ofTotal", count)` → replaces `{0}`
- Translations in `app/src/lib/i18n/translations/{en,ar,es,fr}.ts`
- Add new keys to `en.ts` first, then to `ar.ts`, `es.ts`, `fr.ts`
- TypeScript type safety: `TranslationKeys` type exported from `en.ts`
