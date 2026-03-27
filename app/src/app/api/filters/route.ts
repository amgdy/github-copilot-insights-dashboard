import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dimUser, dimOrg } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getGitHubConfig } from "@/lib/db/settings";
import { resolveDisplayNames, formatUserLabel } from "@/lib/github/resolve-display-names";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [users, teams, orgs] = await Promise.all([
      // Distinct users from dimUser (current only)
      db
        .select({
          userId: dimUser.userId,
          userLogin: dimUser.userLogin,
        })
        .from(dimUser)
        .where(eq(dimUser.isCurrent, true))
        .orderBy(dimUser.userLogin),

      // Distinct team names from dimUser (non-null)
      db
        .selectDistinct({
          teamName: dimUser.teamName,
        })
        .from(dimUser)
        .where(sql`${dimUser.teamName} IS NOT NULL AND ${dimUser.isCurrent} = true`)
        .orderBy(dimUser.teamName),

      // All orgs
      db
        .select({
          orgId: dimOrg.orgId,
          orgName: dimOrg.orgName,
        })
        .from(dimOrg)
        .orderBy(dimOrg.orgName),
    ]);

    // Resolve display names for users
    const logins = users.map((u) => u.userLogin);
    const { token } = await getGitHubConfig();
    const displayNameMap = token
      ? await resolveDisplayNames(logins, token)
      : new Map<string, string>();

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.userId,
        login: u.userLogin,
        displayLabel: formatUserLabel(u.userLogin, displayNameMap),
      })),
      teams: teams.filter((t) => t.teamName).map((t) => t.teamName),
      orgs: orgs.map((o) => ({ id: o.orgId, name: o.orgName })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Filters API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
