import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ingestionLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = paramsSchema.parse(await params);

    const rows = await db
      .select({
        id: ingestionLog.id,
        ingestionDate: ingestionLog.ingestionDate,
        source: ingestionLog.source,
        startedAt: ingestionLog.startedAt,
        completedAt: ingestionLog.completedAt,
        status: ingestionLog.status,
        recordsFetched: ingestionLog.recordsFetched,
        recordsInserted: ingestionLog.recordsInserted,
        recordsSkipped: ingestionLog.recordsSkipped,
        errorMessage: ingestionLog.errorMessage,
        apiRequests: ingestionLog.apiRequests,
        logMessages: ingestionLog.logMessages,
      })
      .from(ingestionLog)
      .where(eq(ingestionLog.id, id))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Ingestion log not found" }, { status: 404 });
    }

    const entry = rows[0];

    // Build a human-readable log file
    const lines: string[] = [
      `=== Ingestion Log #${entry.id} ===`,
      `Date:      ${entry.ingestionDate}`,
      `Source:    ${entry.source}`,
      `Status:    ${entry.status}`,
      `Started:   ${entry.startedAt ? new Date(entry.startedAt).toISOString() : "N/A"}`,
      `Completed: ${entry.completedAt ? new Date(entry.completedAt).toISOString() : "In progress"}`,
      `Records Fetched:  ${entry.recordsFetched ?? 0}`,
      `Records Inserted: ${entry.recordsInserted ?? 0}`,
      `Records Skipped:  ${entry.recordsSkipped ?? 0}`,
      `API Requests:     ${entry.apiRequests ?? 0}`,
    ];

    if (entry.errorMessage) {
      lines.push("", `=== Error ===`, entry.errorMessage);
    }

    if (entry.logMessages) {
      lines.push("", `=== Detailed Log ===`, entry.logMessages);
    } else {
      lines.push("", "(No detailed log messages available for this run)");
    }

    const content = lines.join("\n");
    const filename = `ingestion-log-${entry.id}-${entry.ingestionDate}.txt`;

    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid log ID" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Failed to fetch ingestion log";
    console.error("Ingestion log download error:", message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
