import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ingestionLog } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(ingestionLog)
      .orderBy(desc(ingestionLog.startedAt))
      .limit(100);

    return NextResponse.json({ history: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch sync history";
    console.error("Sync history API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
