import { NextRequest, NextResponse } from "next/server";
import { ingestCopilotUsage } from "@/lib/etl/ingest";
import { getGitHubConfig } from "@/lib/db/settings";
import { z } from "zod";
import { isValidDate } from "@/lib/utils";

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

    const result = await ingestCopilotUsage({
      enterpriseSlug: slug,
      token,
      day: params.day,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingestion failed";
    console.error("Ingest API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
