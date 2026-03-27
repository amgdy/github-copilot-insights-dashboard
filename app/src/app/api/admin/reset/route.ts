import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const TABLES_TO_TRUNCATE = [
  "fact_copilot_usage_daily",
  "fact_user_feature_daily",
  "fact_user_ide_daily",
  "fact_user_language_daily",
  "fact_user_model_daily",
  "fact_user_language_model_daily",
  "fact_cli_daily",
  "raw_copilot_usage",
  "dim_user",
  "dim_ide",
  "dim_feature",
  "dim_language",
  "dim_model",
  "dim_org",
  "dim_enterprise",
  "dim_date",
  "ingestion_log",
];

export async function POST() {
  try {
    const truncated: string[] = [];
    const skipped: string[] = [];

    for (const table of TABLES_TO_TRUNCATE) {
      try {
        await db.execute(sql.raw(`TRUNCATE TABLE "${table}" CASCADE`));
        truncated.push(table);
      } catch {
        // Table may not exist yet
        skipped.push(table);
      }
    }

    console.info(`Database reset: truncated ${truncated.length} tables, skipped ${skipped.length}`);

    return NextResponse.json({
      success: true,
      message: `Truncated ${truncated.length} tables`,
      truncated,
      skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to reset database";
    console.error("Database reset failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
