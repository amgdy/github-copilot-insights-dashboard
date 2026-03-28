import { NextRequest, NextResponse } from "next/server";
import {
  getSchedulerStatus,
  startScheduler,
  stopScheduler,
  updateInterval,
} from "@/lib/etl/scheduler";
import { getSetting, setSetting } from "@/lib/db/settings";
import { z } from "zod";

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
    const message = err instanceof Error ? err.message : "Failed to get scheduler status";
    console.error("Sync schedule GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
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

      return NextResponse.json({
        success: true,
        message: `Sync scheduler started — next run at ${status.nextRunAt}`,
        ...status,
      });
    } else {
      await setSetting("sync_enabled", "false");
      stopScheduler();

      return NextResponse.json({
        success: true,
        message: "Sync scheduler stopped",
        ...getSchedulerStatus(),
      });
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: err.errors },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to update scheduler";
    console.error("Sync schedule POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
