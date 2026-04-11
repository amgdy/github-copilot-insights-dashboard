import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

export type AuditCategory =
  | "auth"
  | "settings"
  | "data_sync"
  | "admin"
  | "system";

interface AuditEntry {
  action: string;
  category: AuditCategory;
  actor?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Log an audit event to the database.
 * Fire-and-forget — errors are logged but never thrown to callers.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      action: entry.action,
      category: entry.category,
      actor: entry.actor ?? "system",
      details: entry.details ?? null,
      ipAddress: entry.ipAddress ?? null,
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

/**
 * Extract client IP address from request headers.
 */
export function getClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? undefined;
}
