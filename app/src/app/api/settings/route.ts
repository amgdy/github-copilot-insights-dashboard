import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting, deleteSetting } from "@/lib/db/settings";
import { z } from "zod";
import { logAudit, getClientIp } from "@/lib/audit";
import { safeErrorMessage } from "@/lib/auth";

const ALLOWED_KEYS = ["github_token", "github_enterprise_slug", "sync_scope", "sync_org_logins"] as const;
type SettingKey = (typeof ALLOWED_KEYS)[number];

const putSchema = z.object({
  key: z.enum(ALLOWED_KEYS),
  value: z.string().min(1).max(1000),
});

const deleteSchema = z.object({
  key: z.enum(ALLOWED_KEYS),
});

function maskToken(value: string): string {
  if (value.length <= 8) return "••••••••";
  return value.slice(0, 4) + "••••" + value.slice(-4);
}

export async function GET() {
  try {
    const token = await getSetting("github_token");
    const slug = await getSetting("github_enterprise_slug");
    const syncScope = await getSetting("sync_scope");
    const syncOrgLogins = await getSetting("sync_org_logins");

    return NextResponse.json({
      settings: {
        github_token: token ? { configured: true, masked: maskToken(token) } : { configured: false },
        github_enterprise_slug: slug ? { configured: true, value: slug } : { configured: false },
        sync_scope: syncScope ? { configured: true, value: syncScope } : { configured: false, value: "enterprise" },
        sync_org_logins: syncOrgLogins ? { configured: true, value: syncOrgLogins } : { configured: false, value: "" },
      },
    });
  } catch (err) {
    console.error("Settings GET error:", err);
    return NextResponse.json({ error: safeErrorMessage(err, "Failed to read settings") }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value } = putSchema.parse(body);

    await setSetting(key, value);
    console.info(`Setting "${key}" updated successfully`);
    logAudit({
      action: "setting_updated",
      category: "settings",
      details: { key, valuePreview: key === "github_token" ? "***" : value.slice(0, 50) },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true, key });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: err.issues },
        { status: 400 }
      );
    }
    console.error("Settings PUT error:", err);
    return NextResponse.json({ error: safeErrorMessage(err, "Failed to save setting") }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { key } = deleteSchema.parse(body);

    await deleteSetting(key);
    console.info(`Setting "${key}" deleted`);
    logAudit({
      action: "setting_deleted",
      category: "settings",
      details: { key },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true, key });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: err.issues },
        { status: 400 }
      );
    }
    console.error("Settings DELETE error:", err);
    return NextResponse.json({ error: safeErrorMessage(err, "Failed to delete setting") }, { status: 500 });
  }
}
