import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting, deleteSetting } from "@/lib/db/settings";
import { z } from "zod";

const ALLOWED_KEYS = ["github_token", "github_enterprise_slug"] as const;
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

    return NextResponse.json({
      settings: {
        github_token: token ? { configured: true, masked: maskToken(token) } : { configured: false },
        github_enterprise_slug: slug ? { configured: true, value: slug } : { configured: false },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read settings";
    console.error("Settings GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value } = putSchema.parse(body);

    await setSetting(key, value);
    console.info(`Setting "${key}" updated successfully`);

    return NextResponse.json({ success: true, key });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: err.issues },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to save setting";
    console.error("Settings PUT error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { key } = deleteSchema.parse(body);

    await deleteSetting(key);
    console.info(`Setting "${key}" deleted`);

    return NextResponse.json({ success: true, key });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: err.issues },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to delete setting";
    console.error("Settings DELETE error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
