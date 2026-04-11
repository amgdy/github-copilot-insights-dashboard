import { NextResponse } from "next/server";
import { getGitHubConfig } from "@/lib/db/settings";
import { listEnterpriseOrgs } from "@/lib/github/copilot-api";
import { safeErrorMessage } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET — Discover all organizations in the configured enterprise.
 * Returns the list of orgs from the GitHub API.
 */
export async function GET() {
  try {
    const { token, enterpriseSlug } = await getGitHubConfig();

    if (!token || !enterpriseSlug) {
      return NextResponse.json(
        { error: "GitHub token and enterprise slug must be configured first." },
        { status: 400 }
      );
    }

    const { orgs } = await listEnterpriseOrgs({
      enterpriseSlug,
      token,
    });

    return NextResponse.json({
      orgs: orgs.map((o) => ({ login: o.login, id: o.id })),
    });
  } catch (err) {
    console.error("Org discovery error:", err);
    return NextResponse.json({ error: safeErrorMessage(err, "Failed to discover organizations") }, { status: 500 });
  }
}
