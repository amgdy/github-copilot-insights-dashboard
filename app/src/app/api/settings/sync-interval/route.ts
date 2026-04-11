import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db/settings";
import { updateInterval } from "@/lib/etl/scheduler";
import { z } from "zod";
import { logAudit, getClientIp } from "@/lib/audit";
import { safeErrorMessage } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 1440; // 24 hours

const PRESET_MINUTES = [1, 5, 15, 30, 60, 120, 360, 720, 1440];

const putSchema = z.object({
  intervalMinutes: z.coerce
    .number()
    .int()
    .min(MIN_INTERVAL_MINUTES, { message: `Minimum sync interval is ${MIN_INTERVAL_MINUTES} minute` })
    .max(MAX_INTERVAL_MINUTES, { message: `Maximum sync interval is ${MAX_INTERVAL_MINUTES} minutes (24 hours)` }),
});

function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export async function GET() {
  try {
    const savedMinutes = await getSetting("sync_interval_minutes");
    let intervalMinutes: number;

    if (savedMinutes) {
      intervalMinutes = Number(savedMinutes);
    } else {
      // Backward compatibility: migrate from sync_interval_hours
      const savedHours = await getSetting("sync_interval_hours");
      intervalMinutes = savedHours ? Number(savedHours) * 60 : 1440;
    }

    return NextResponse.json({
      intervalMinutes,
      presetMinutes: PRESET_MINUTES,
      minInterval: MIN_INTERVAL_MINUTES,
      maxInterval: MAX_INTERVAL_MINUTES,
      note: "GitHub Copilot Metrics API data refreshes approximately once every 24 hours.",
    });
  } catch (err) {
    console.error("Sync interval GET error:", err);
    return NextResponse.json({ error: safeErrorMessage(err, "Failed to read sync interval") }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { intervalMinutes } = putSchema.parse(body);

    await setSetting("sync_interval_minutes", String(intervalMinutes));
    updateInterval(intervalMinutes);
    const label = formatInterval(intervalMinutes);
    console.info(`Sync interval updated to ${label}.`);
    logAudit({
      action: "sync_interval_updated",
      category: "settings",
      details: { intervalMinutes, label },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      success: true,
      intervalMinutes,
      message: `Sync interval set to ${label}.`,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: err.issues },
        { status: 400 }
      );
    }
    console.error("Sync interval PUT error:", err);
    return NextResponse.json({ error: safeErrorMessage(err, "Failed to save sync interval") }, { status: 500 });
  }
}
