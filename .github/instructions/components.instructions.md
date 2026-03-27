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
import { ReportFilters, type FilterState } from "@/components/layout/report-filters";
import { DataTable } from "@/components/ui/data-table";
import { Line, Bar, Doughnut } from "react-chartjs-2";

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function MyPage() {
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
