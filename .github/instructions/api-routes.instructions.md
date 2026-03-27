---
description: "Use when creating or modifying Next.js API route handlers. Covers Zod validation, Drizzle ORM queries, error handling, and response patterns."
applyTo: "app/src/app/api/**/*.ts"
---
# API Route Conventions

## Structure

Every API route handler follows this pattern:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isValidDate } from "@/lib/utils";

const querySchema = z.object({
  start: z.string().refine(isValidDate).optional(),
  end: z.string().refine(isValidDate).optional(),
  userId: z.coerce.number().int().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const params = querySchema.parse({
      start: sp.get("start") ?? undefined,
      end: sp.get("end") ?? undefined,
      userId: sp.get("userId") ?? undefined,
    });

    // Business logic with Drizzle ORM
    const result = await db.select().from(table).where(conditions);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch data:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

## Rules

- Validate ALL query params with Zod — use `z.coerce` for numbers
- Date format: `YYYY-MM-DD` — validate with `isValidDate()` from `@/lib/utils`
- Use Drizzle ORM only — no raw SQL
- Wrap all handlers in try-catch
- Log errors with `console.error` — never `console.log`
- Return generic error messages to clients — never leak stack traces
- Use `NextResponse.json()` for all responses
