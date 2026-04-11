import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { logAudit, getClientIp } from "@/lib/audit";
import { requireAdminAuth, safeErrorMessage } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Hardcoded allowlist — never derived from user input. */
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
] as const;

/** Validate that a name is a safe SQL identifier (alphanumeric + underscores only). */
function isSafeIdentifier(name: string): boolean {
  return /^[a-z_][a-z0-9_]*$/.test(name);
}

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const truncated: string[] = [];
    const skipped: string[] = [];

    for (const table of TABLES_TO_TRUNCATE) {
      if (!isSafeIdentifier(table)) {
        skipped.push(table);
        continue;
      }
      try {
        await db.execute(sql`TRUNCATE TABLE ${sql.identifier(table)} CASCADE`);
        truncated.push(table);
      } catch {
        // Table may not exist yet
        skipped.push(table);
      }
    }

    console.info(`Database reset: truncated ${truncated.length} tables, skipped ${skipped.length}`);
    logAudit({
      action: "database_reset",
      category: "admin",
      details: { truncated, skipped },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      success: true,
      message: `Truncated ${truncated.length} tables`,
      truncated,
      skipped,
    });
  } catch (err) {
    console.error("Database reset failed:", err);
    return NextResponse.json(
      { error: safeErrorMessage(err, "Failed to reset database") },
      { status: 500 },
    );
  }
}
