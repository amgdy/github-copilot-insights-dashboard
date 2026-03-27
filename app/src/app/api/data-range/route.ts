import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { factCopilotUsageDaily, ingestionLog } from "@/lib/db/schema";
import { sql, eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [dateRange, lastSync] = await Promise.all([
      db
        .select({
          minDate: sql<string>`MIN(${factCopilotUsageDaily.day})`,
          maxDate: sql<string>`MAX(${factCopilotUsageDaily.day})`,
          totalRows: sql<number>`COUNT(*)`,
        })
        .from(factCopilotUsageDaily),

      db
        .select({
          completedAt: ingestionLog.completedAt,
          status: ingestionLog.status,
          source: ingestionLog.source,
        })
        .from(ingestionLog)
        .where(eq(ingestionLog.status, "completed"))
        .orderBy(desc(ingestionLog.completedAt))
        .limit(1),
    ]);

    const range = dateRange[0];
    const sync = lastSync[0];

    return NextResponse.json({
      dataStart: range?.minDate ?? null,
      dataEnd: range?.maxDate ?? null,
      totalRows: Number(range?.totalRows ?? 0),
      lastSyncAt: sync?.completedAt ?? null,
      lastSyncSource: sync?.source ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Data range API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
