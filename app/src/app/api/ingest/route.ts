import { NextRequest, NextResponse } from "next/server";
import { ingestCopilotUsage } from "@/lib/etl/ingest";
import { getGitHubConfig, getSyncScopeConfig } from "@/lib/db/settings";
import { z } from "zod";
import { isValidDate } from "@/lib/utils";
import { logAudit, getClientIp } from "@/lib/audit";
import { safeErrorMessage } from "@/lib/auth";

const bodySchema = z.object({
  day: z.string().refine(isValidDate).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { token, enterpriseSlug: slug } = await getGitHubConfig();

    if (!token || !slug) {
      return NextResponse.json(
        { error: "GitHub token and enterprise slug must be configured. Go to Settings to set them up." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const params = bodySchema.parse(body);
    const { scopes, orgLogins } = await getSyncScopeConfig();

    const result = await ingestCopilotUsage({
      enterpriseSlug: slug,
      token,
      day: params.day,
      scopes,
      orgLogins,
    });

    logAudit({
      action: "data_sync_manual",
      category: "data_sync",
      details: { day: params.day ?? "latest", scopes },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Ingest API error:", err);
    return NextResponse.json({ error: safeErrorMessage(err, "Ingestion failed") }, { status: 500 });
  }
}
