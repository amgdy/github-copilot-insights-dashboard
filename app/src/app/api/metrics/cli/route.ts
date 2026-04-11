import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  factCopilotUsageDaily,
  factCliDaily,
  dimUser,
} from "@/lib/db/schema";
import { sql, and, gte, lte, eq, inArray } from "drizzle-orm";
import { daysAgo, isValidDate } from "@/lib/utils";
import { z } from "zod";
import { getGitHubConfig } from "@/lib/db/settings";
import { resolveDisplayNames, formatUserLabel } from "@/lib/github/resolve-display-names";
import { safeErrorMessage } from "@/lib/auth";

const querySchema = z.object({
  days: z.coerce.number().int().positive().optional(),
  start: z.string().refine(isValidDate).optional(),
  end: z.string().refine(isValidDate).optional(),
  userId: z.coerce.number().int().optional(),
  teamName: z.string().optional(),
  orgId: z.string().optional(),
});

function parseOrgIds(orgId?: string): number[] {
  if (!orgId) return [];
  return orgId.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
}

async function resolveUserFilter(params: {
  userId?: number;
  teamName?: string;
  orgId?: string;
}): Promise<number[] | null> {
  if (params.userId) return [params.userId];
  const orgIds = parseOrgIds(params.orgId);
  if (params.teamName || orgIds.length > 0) {
    const conditions = [eq(dimUser.isCurrent, true)];
    if (params.teamName) conditions.push(eq(dimUser.teamName, params.teamName));
    if (orgIds.length === 1) conditions.push(eq(dimUser.orgId, orgIds[0]));
    else if (orgIds.length > 1) conditions.push(inArray(dimUser.orgId, orgIds));
    const users = await db
      .select({ userId: dimUser.userId })
      .from(dimUser)
      .where(and(...conditions));
    return users.map((u) => u.userId);
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const params = querySchema.parse({
      days: sp.get("days") ?? undefined,
      start: sp.get("start") ?? undefined,
      end: sp.get("end") ?? undefined,
      userId: sp.get("userId") ?? undefined,
      teamName: sp.get("teamName") ?? undefined,
      orgId: sp.get("orgId") ?? undefined,
    });

    const endDate = params.end ?? new Date().toISOString().split("T")[0];
    const startDate = params.start ?? daysAgo(params.days ?? 28);
    const userIds = await resolveUserFilter(params);

    // Where clauses for factCopilotUsageDaily (all users)
    const mainWhere = () => {
      const conds = [
        gte(factCopilotUsageDaily.day, startDate),
        lte(factCopilotUsageDaily.day, endDate),
      ];
      if (userIds) conds.push(inArray(factCopilotUsageDaily.userId, userIds));
      return and(...conds);
    };

    // Where clauses for factCopilotUsageDaily (CLI users only)
    const cliWhere = () => {
      const conds = [
        gte(factCopilotUsageDaily.day, startDate),
        lte(factCopilotUsageDaily.day, endDate),
        eq(factCopilotUsageDaily.usedCli, true),
      ];
      if (userIds) conds.push(inArray(factCopilotUsageDaily.userId, userIds));
      return and(...conds);
    };

    // Where clauses for factCliDaily
    const cliFactWhere = () => {
      const conds = [
        gte(factCliDaily.day, startDate),
        lte(factCliDaily.day, endDate),
      ];
      if (userIds) conds.push(inArray(factCliDaily.userId, userIds));
      return and(...conds);
    };

    const [
      kpiResult,
      cliFactKpi,
      dailyCliUsers,
      dailyAllUsers,
      dailyCliActivity,
      dailyTokenUsage,
      cliVsNonCliCodeGen,
      cliProductivity,
      weeklyCliAdoption,
      cliVersionDist,
      topCliUsers,
    ] = await Promise.all([
      // 1. KPI from factCopilotUsageDaily (active users, CLI users, code gen)
      db
        .select({
          activeUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId})`,
          cliUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId}) FILTER (WHERE ${factCopilotUsageDaily.usedCli} = true)`,
          cliCodeGen: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeGenerationActivityCount}) FILTER (WHERE ${factCopilotUsageDaily.usedCli} = true), 0)`,
          cliCodeAccept: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeAcceptanceActivityCount}) FILTER (WHERE ${factCopilotUsageDaily.usedCli} = true), 0)`,
          cliLocAdded: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.locAddedSum}) FILTER (WHERE ${factCopilotUsageDaily.usedCli} = true), 0)`,
          cliLocSuggested: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.locSuggestedToAddSum}) FILTER (WHERE ${factCopilotUsageDaily.usedCli} = true), 0)`,
          totalCodeGen: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeGenerationActivityCount}), 0)`,
        })
        .from(factCopilotUsageDaily)
        .where(mainWhere()),

      // 2. KPI from factCliDaily (sessions, requests, tokens)
      db
        .select({
          totalSessions: sql<number>`COALESCE(SUM(${factCliDaily.sessionCount}), 0)`,
          totalRequests: sql<number>`COALESCE(SUM(${factCliDaily.requestCount}), 0)`,
          totalPrompts: sql<number>`COALESCE(SUM(${factCliDaily.promptCount}), 0)`,
          totalPromptTokens: sql<number>`COALESCE(SUM(${factCliDaily.promptTokens}), 0)`,
          totalCompletionTokens: sql<number>`COALESCE(SUM(${factCliDaily.completionTokens}), 0)`,
          totalTokens: sql<number>`COALESCE(SUM(${factCliDaily.totalTokens}), 0)`,
        })
        .from(factCliDaily)
        .where(cliFactWhere()),

      // 3. Daily CLI users over time
      db
        .select({
          date: factCopilotUsageDaily.day,
          value: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId})`,
        })
        .from(factCopilotUsageDaily)
        .where(cliWhere())
        .groupBy(factCopilotUsageDaily.day)
        .orderBy(factCopilotUsageDaily.day),

      // 4. Daily all active users (for overlay)
      db
        .select({
          date: factCopilotUsageDaily.day,
          value: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId})`,
        })
        .from(factCopilotUsageDaily)
        .where(mainWhere())
        .groupBy(factCopilotUsageDaily.day)
        .orderBy(factCopilotUsageDaily.day),

      // 5. Daily CLI sessions & requests over time (from factCliDaily)
      db
        .select({
          date: factCliDaily.day,
          sessions: sql<number>`COALESCE(SUM(${factCliDaily.sessionCount}), 0)`,
          requests: sql<number>`COALESCE(SUM(${factCliDaily.requestCount}), 0)`,
        })
        .from(factCliDaily)
        .where(cliFactWhere())
        .groupBy(factCliDaily.day)
        .orderBy(factCliDaily.day),

      // 6. Daily token usage trends (from factCliDaily)
      db
        .select({
          date: factCliDaily.day,
          promptTokens: sql<number>`COALESCE(SUM(${factCliDaily.promptTokens}), 0)`,
          completionTokens: sql<number>`COALESCE(SUM(${factCliDaily.completionTokens}), 0)`,
        })
        .from(factCliDaily)
        .where(cliFactWhere())
        .groupBy(factCliDaily.day)
        .orderBy(factCliDaily.day),

      // 7. CLI vs non-CLI code generation by day
      db
        .select({
          date: factCopilotUsageDaily.day,
          cliCodeGen: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeGenerationActivityCount}) FILTER (WHERE ${factCopilotUsageDaily.usedCli} = true), 0)`,
          nonCliCodeGen: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeGenerationActivityCount}) FILTER (WHERE ${factCopilotUsageDaily.usedCli} = false), 0)`,
        })
        .from(factCopilotUsageDaily)
        .where(mainWhere())
        .groupBy(factCopilotUsageDaily.day)
        .orderBy(factCopilotUsageDaily.day),

      // 8. CLI user productivity vs non-CLI (avg per user per day)
      db
        .select({
          date: factCopilotUsageDaily.day,
          cliAvgCodeGen: sql<number>`COALESCE(AVG(${factCopilotUsageDaily.codeGenerationActivityCount}) FILTER (WHERE ${factCopilotUsageDaily.usedCli} = true), 0)`,
          nonCliAvgCodeGen: sql<number>`COALESCE(AVG(${factCopilotUsageDaily.codeGenerationActivityCount}) FILTER (WHERE ${factCopilotUsageDaily.usedCli} = false), 0)`,
        })
        .from(factCopilotUsageDaily)
        .where(mainWhere())
        .groupBy(factCopilotUsageDaily.day)
        .orderBy(factCopilotUsageDaily.day),

      // 9. Weekly CLI adoption rate
      db
        .select({
          date: sql<string>`DATE_TRUNC('week', ${factCopilotUsageDaily.day}::date)::date::text`,
          totalUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId})`,
          cliUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId}) FILTER (WHERE ${factCopilotUsageDaily.usedCli} = true)`,
        })
        .from(factCopilotUsageDaily)
        .where(mainWhere())
        .groupBy(sql`DATE_TRUNC('week', ${factCopilotUsageDaily.day}::date)`)
        .orderBy(sql`DATE_TRUNC('week', ${factCopilotUsageDaily.day}::date)`),

      // 10. CLI version distribution
      db
        .select({
          version: factCliDaily.cliVersion,
          users: sql<number>`COUNT(DISTINCT ${factCliDaily.userId})`,
          sessions: sql<number>`COALESCE(SUM(${factCliDaily.sessionCount}), 0)`,
        })
        .from(factCliDaily)
        .where(cliFactWhere())
        .groupBy(factCliDaily.cliVersion)
        .orderBy(sql`SUM(${factCliDaily.sessionCount}) DESC`),

      // 11. Top CLI users (join both tables)
      db
        .select({
          userId: factCopilotUsageDaily.userId,
          userLogin: factCopilotUsageDaily.userLogin,
          daysActive: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.day})`,
          totalInteractions: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.userInitiatedInteractionCount}), 0)`,
          codeGenerated: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeGenerationActivityCount}), 0)`,
          codeAccepted: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeAcceptanceActivityCount}), 0)`,
          locAdded: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.locAddedSum}), 0)`,
        })
        .from(factCopilotUsageDaily)
        .where(cliWhere())
        .groupBy(factCopilotUsageDaily.userId, factCopilotUsageDaily.userLogin)
        .orderBy(sql`SUM(${factCopilotUsageDaily.codeGenerationActivityCount}) DESC`)
        .limit(200),
    ]);

    const kpi = kpiResult[0];
    const cliKpi = cliFactKpi[0];

    // Build daily CLI users with total overlay
    const allUsersMap = new Map(dailyAllUsers.map((d) => [d.date, d.value]));
    const cliUsersOverTime = dailyCliUsers.map((d) => ({
      date: d.date,
      cliUsers: d.value,
      totalUsers: allUsersMap.get(d.date) ?? 0,
    }));

    // Weekly adoption rate
    const weeklyAdoptionRate = weeklyCliAdoption.map((w) => ({
      date: w.date,
      rate: w.totalUsers > 0 ? Math.round((w.cliUsers / w.totalUsers) * 1000) / 10 : 0,
      cliUsers: w.cliUsers,
      totalUsers: w.totalUsers,
    }));

    // Enrich top CLI users with session/token data from factCliDaily
    const cliUserStats = await db
      .select({
        userId: factCliDaily.userId,
        sessions: sql<number>`COALESCE(SUM(${factCliDaily.sessionCount}), 0)`,
        requests: sql<number>`COALESCE(SUM(${factCliDaily.requestCount}), 0)`,
        tokens: sql<number>`COALESCE(SUM(${factCliDaily.totalTokens}), 0)`,
      })
      .from(factCliDaily)
      .where(cliFactWhere())
      .groupBy(factCliDaily.userId);

    const cliStatsMap = new Map(cliUserStats.map((s) => [s.userId, s]));

    // Resolve display names
    const cliLogins = topCliUsers.map((u) => u.userLogin);
    const { token } = await getGitHubConfig();
    const displayNameMap = token
      ? await resolveDisplayNames(cliLogins, token)
      : new Map<string, string>();

    const topCliUsersEnriched = topCliUsers.map((u) => {
      const stats = cliStatsMap.get(u.userId);
      const codeGen = Number(u.codeGenerated);
      const codeAcc = Number(u.codeAccepted);
      return {
        userId: u.userId,
        userLogin: u.userLogin,
        displayLabel: formatUserLabel(u.userLogin, displayNameMap),
        daysActive: Number(u.daysActive),
        totalInteractions: Number(u.totalInteractions),
        codeGenerated: codeGen,
        codeAccepted: codeAcc,
        acceptanceRate: codeGen > 0
          ? Math.round((codeAcc / codeGen) * 1000) / 10
          : 0,
        locAdded: Number(u.locAdded),
        sessions: Number(stats?.sessions ?? 0),
        requests: Number(stats?.requests ?? 0),
        tokens: Number(stats?.tokens ?? 0),
      };
    });

    return NextResponse.json({
      period: { start: startDate, end: endDate },
      kpis: {
        activeUsers: kpi.activeUsers,
        cliUsers: kpi.cliUsers,
        cliAdoptionRate: kpi.activeUsers > 0
          ? Math.round((kpi.cliUsers / kpi.activeUsers) * 100)
          : 0,
        cliCodeGen: kpi.cliCodeGen,
        cliCodeAccept: kpi.cliCodeAccept,
        cliAcceptanceRate: kpi.cliCodeGen > 0
          ? Math.round((kpi.cliCodeAccept / kpi.cliCodeGen) * 1000) / 10
          : 0,
        cliLocAdded: kpi.cliLocAdded,
        cliLocSuggested: kpi.cliLocSuggested,
        totalCodeGen: kpi.totalCodeGen,
        cliCodeGenShare: kpi.totalCodeGen > 0
          ? Math.round((kpi.cliCodeGen / kpi.totalCodeGen) * 1000) / 10
          : 0,
        totalSessions: cliKpi.totalSessions,
        totalRequests: cliKpi.totalRequests,
        totalTokens: cliKpi.totalTokens,
        totalPromptTokens: cliKpi.totalPromptTokens,
        totalCompletionTokens: cliKpi.totalCompletionTokens,
      },
      cliUsersOverTime,
      dailyCliActivity,
      dailyTokenUsage,
      cliVsNonCliCodeGen,
      cliProductivity,
      weeklyAdoptionRate,
      cliVersionDistribution: cliVersionDist,
      topCliUsers: topCliUsersEnriched,
    });
  } catch (err) {
    console.error("CLI Metrics API error:", err);
    return NextResponse.json({ error: safeErrorMessage(err, "Internal server error") }, { status: 500 });
  }
}
