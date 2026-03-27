import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db/settings";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * GitHub Copilot Usage Metrics API refreshes data once per day (~24h).
 * Recommended sync intervals:
 *   - 24h (once daily) — aligned with API refresh cycle
 *   - 12h (twice daily) — catch updates sooner
 *   - 6h (four times daily) — aggressive, for near-real-time needs
 *   - 1h — development/testing only
 */
const ALLOWED_INTERVALS = [1, 6, 12, 24];

const putSchema = z.object({
  intervalHours: z.number().refine((v) => ALLOWED_INTERVALS.includes(v), {
    message: `Allowed sync intervals: ${ALLOWED_INTERVALS.join(", ")} hours`,
  }),
});

export async function GET() {
  try {
    const saved = await getSetting("sync_interval_hours");
    const intervalHours = saved ? Number(saved) : 24;

    return NextResponse.json({
      intervalHours,
      allowedIntervals: ALLOWED_INTERVALS,
      note: "GitHub Copilot Metrics API data refreshes approximately once every 24 hours.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read sync interval";
    console.error("Sync interval GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { intervalHours } = putSchema.parse(body);

    await setSetting("sync_interval_hours", String(intervalHours));
    console.info(`Sync interval updated to ${intervalHours}h. Restart required for interval to take effect.`);

    return NextResponse.json({
      success: true,
      intervalHours,
      message: `Sync interval set to ${intervalHours}h. Restart the app for changes to take effect.`,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: err.errors },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to save sync interval";
    console.error("Sync interval PUT error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
