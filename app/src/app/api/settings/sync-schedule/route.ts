import { NextRequest, NextResponse } from "next/server";
import {
  getSchedulerStatus,
  startScheduler,
  stopScheduler,
  updateInterval,
} from "@/lib/etl/scheduler";
import { getSetting, setSetting } from "@/lib/db/settings";
import { z } from "zod";
import { logAudit, getClientIp } from "@/lib/audit";
import { safeErrorMessage } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET — Return current scheduler status (enabled, interval, next/last run).
 */
export async function GET() {
  try {
    const status = getSchedulerStatus();
    const savedEnabled = await getSetting("sync_enabled");

    return NextResponse.json({
      ...status,
      // If scheduler hasn't been initialized yet, fall back to saved setting
      enabled: status.enabled || savedEnabled === "true",
    });
  } catch (err) {
    console.error("Sync schedule GET error:", err);
    return NextResponse.json({ error: safeErrorMessage(err, "Failed to get scheduler status") }, { status: 500 });
  }
}

const actionSchema = z.object({
  action: z.enum(["start", "stop"]),
  intervalMinutes: z.coerce.number().int().min(1).max(1440).optional(),
});

/**
 * POST — Start or stop the scheduler.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, intervalMinutes } = actionSchema.parse(body);

    if (action === "start") {
      // Read saved interval if not provided
      let minutes = intervalMinutes;
      if (!minutes) {
        const saved = await getSetting("sync_interval_minutes");
        minutes = saved ? Number(saved) : 1440;
      }

      // Persist the interval + enabled state
      await setSetting("sync_interval_minutes", String(minutes));
      await setSetting("sync_enabled", "true");

      startScheduler(minutes);
      const status = getSchedulerStatus();
      logAudit({
        action: "scheduler_started",
        category: "data_sync",
        details: { intervalMinutes: minutes },
        ipAddress: getClientIp(request),
      });

      return NextResponse.json({
        success: true,
        message: `Sync scheduler started — next run at ${status.nextRunAt}`,
        ...status,
      });
    } else {
      await setSetting("sync_enabled", "false");
      stopScheduler();
      logAudit({
        action: "scheduler_stopped",
        category: "data_sync",
        ipAddress: getClientIp(request),
      });

      return NextResponse.json({
        success: true,
        message: "Sync scheduler stopped",
        ...getSchedulerStatus(),
      });
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: err.issues },
        { status: 400 }
      );
    }
    console.error("Sync schedule POST error:", err);
    return NextResponse.json({ error: safeErrorMessage(err, "Failed to update scheduler") }, { status: 500 });
  }
}
