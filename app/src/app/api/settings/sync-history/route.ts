import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ingestionLog } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { safeErrorMessage } from "@/lib/auth";

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
    console.error("Sync history API error:", err);
    return NextResponse.json({ error: safeErrorMessage(err, "Failed to fetch sync history") }, { status: 500 });
  }
}
