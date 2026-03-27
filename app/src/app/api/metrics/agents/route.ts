import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  factCopilotUsageDaily,
  factUserFeatureDaily,
  factUserModelDaily,
  dimFeature,
  dimModel,
  dimUser,
} from "@/lib/db/schema";
import { sql, and, gte, lte, eq, inArray, like } from "drizzle-orm";
import { daysAgo, isValidDate } from "@/lib/utils";
import { z } from "zod";
import { getGitHubConfig } from "@/lib/db/settings";
import { resolveDisplayNames, formatUserLabel } from "@/lib/github/resolve-display-names";

const querySchema = z.object({
  days: z.coerce.number().int().positive().optional(),
  start: z.string().refine(isValidDate).optional(),
  end: z.string().refine(isValidDate).optional(),
  userId: z.coerce.number().int().optional(),
  teamName: z.string().optional(),
  orgId: z.coerce.number().int().optional(),
});

async function resolveUserFilter(params: {
  userId?: number;
  teamName?: string;
  orgId?: number;
}): Promise<number[] | null> {
  if (params.userId) return [params.userId];
  if (params.teamName || params.orgId) {
    const conditions = [eq(dimUser.isCurrent, true)];
    if (params.teamName) conditions.push(eq(dimUser.teamName, params.teamName));
    if (params.orgId) conditions.push(eq(dimUser.orgId, params.orgId));
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

    const mainWhere = () => {
      const conds = [
        gte(factCopilotUsageDaily.day, startDate),
        lte(factCopilotUsageDaily.day, endDate),
      ];
      if (userIds) conds.push(inArray(factCopilotUsageDaily.userId, userIds));
      return and(...conds);
    };

    const agentMainWhere = () => {
      const conds = [
        gte(factCopilotUsageDaily.day, startDate),
        lte(factCopilotUsageDaily.day, endDate),
        eq(factCopilotUsageDaily.usedAgent, true),
      ];
      if (userIds) conds.push(inArray(factCopilotUsageDaily.userId, userIds));
      return and(...conds);
    };

    // Agent feature IDs (features containing "agent")
    const agentFeatures = await db
      .select({ featureId: dimFeature.featureId, featureName: dimFeature.featureName })
      .from(dimFeature)
      .where(like(dimFeature.featureName, "%agent%"));

    const agentFeatureIds = agentFeatures.map((f) => f.featureId);

    const [
      kpiResult,
      dailyAgentUsers,
      dailyAllUsers,
      agentModeByDay,
      agentModelUsage,
      topAgentUsers,
      agentVsNonAgentCodeGen,
      weeklyAgentAdoption,
    ] = await Promise.all([
      // 1. KPI: total active, agent users, chat users, agent interactions
      db
        .select({
          activeUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId})`,
          agentUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId}) FILTER (WHERE ${factCopilotUsageDaily.usedAgent} = true)`,
          chatUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId}) FILTER (WHERE ${factCopilotUsageDaily.usedChat} = true)`,
          totalInteractions: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.userInitiatedInteractionCount}), 0)`,
          agentCodeGen: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeGenerationActivityCount}) FILTER (WHERE ${factCopilotUsageDaily.usedAgent} = true), 0)`,
          agentCodeAccept: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeAcceptanceActivityCount}) FILTER (WHERE ${factCopilotUsageDaily.usedAgent} = true), 0)`,
          totalCodeGen: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeGenerationActivityCount}), 0)`,
          totalLocAdded: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.locAddedSum}) FILTER (WHERE ${factCopilotUsageDaily.usedAgent} = true), 0)`,
        })
        .from(factCopilotUsageDaily)
        .where(mainWhere()),

      // 2. Daily agent users over time
      db
        .select({
          date: factCopilotUsageDaily.day,
          value: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId})`,
        })
        .from(factCopilotUsageDaily)
        .where(agentMainWhere())
        .groupBy(factCopilotUsageDaily.day)
        .orderBy(factCopilotUsageDaily.day),

      // 3. Daily all active users (for overlay on agent chart)
      db
        .select({
          date: factCopilotUsageDaily.day,
          value: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId})`,
        })
        .from(factCopilotUsageDaily)
        .where(mainWhere())
        .groupBy(factCopilotUsageDaily.day)
        .orderBy(factCopilotUsageDaily.day),

      // 4. Agent-mode requests by day (feature breakdown for agent features)
      agentFeatureIds.length > 0
        ? db
            .select({
              date: factUserFeatureDaily.day,
              feature: dimFeature.featureName,
              value: sql<number>`COALESCE(SUM(${factUserFeatureDaily.userInitiatedInteractionCount}), 0)`,
            })
            .from(factUserFeatureDaily)
            .innerJoin(dimFeature, eq(factUserFeatureDaily.featureId, dimFeature.featureId))
            .where(
              and(
                gte(factUserFeatureDaily.day, startDate),
                lte(factUserFeatureDaily.day, endDate),
                inArray(factUserFeatureDaily.featureId, agentFeatureIds),
                ...(userIds ? [inArray(factUserFeatureDaily.userId, userIds)] : [])
              )
            )
            .groupBy(factUserFeatureDaily.day, dimFeature.featureName)
            .orderBy(factUserFeatureDaily.day)
        : Promise.resolve([]),

      // 5. Model usage by agent users
      agentFeatureIds.length > 0
        ? db
            .select({
              name: dimModel.modelName,
              value: sql<number>`COALESCE(SUM(${factUserModelDaily.userInitiatedInteractionCount}), 0)`,
            })
            .from(factUserModelDaily)
            .innerJoin(dimModel, eq(factUserModelDaily.modelId, dimModel.modelId))
            .where(
              and(
                gte(factUserModelDaily.day, startDate),
                lte(factUserModelDaily.day, endDate),
                inArray(factUserModelDaily.featureId, agentFeatureIds),
                ...(userIds ? [inArray(factUserModelDaily.userId, userIds)] : [])
              )
            )
            .groupBy(dimModel.modelName)
            .orderBy(sql`SUM(${factUserModelDaily.userInitiatedInteractionCount}) DESC`)
        : Promise.resolve([]),

      // 6. Top agent users
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
        .where(agentMainWhere())
        .groupBy(factCopilotUsageDaily.userId, factCopilotUsageDaily.userLogin)
        .orderBy(sql`SUM(${factCopilotUsageDaily.userInitiatedInteractionCount}) DESC`)
        .limit(200),

      // 7. Agent vs non-agent code generation comparison
      db
        .select({
          date: factCopilotUsageDaily.day,
          agentCodeGen: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeGenerationActivityCount}) FILTER (WHERE ${factCopilotUsageDaily.usedAgent} = true), 0)`,
          nonAgentCodeGen: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeGenerationActivityCount}) FILTER (WHERE ${factCopilotUsageDaily.usedAgent} = false), 0)`,
        })
        .from(factCopilotUsageDaily)
        .where(mainWhere())
        .groupBy(factCopilotUsageDaily.day)
        .orderBy(factCopilotUsageDaily.day),

      // 8. Weekly agent adoption rate
      db
        .select({
          date: sql<string>`DATE_TRUNC('week', ${factCopilotUsageDaily.day}::date)::date::text`,
          totalUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId})`,
          agentUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId}) FILTER (WHERE ${factCopilotUsageDaily.usedAgent} = true)`,
        })
        .from(factCopilotUsageDaily)
        .where(mainWhere())
        .groupBy(sql`DATE_TRUNC('week', ${factCopilotUsageDaily.day}::date)`)
        .orderBy(sql`DATE_TRUNC('week', ${factCopilotUsageDaily.day}::date)`),
    ]);

    const kpi = kpiResult[0];

    // Compute agent feature label map
    const AGENT_LABELS: Record<string, string> = {
      chat_panel_agent_mode: "Agent Mode",
      agent_edit: "Agent Edit",
    };
    const formatAgentFeature = (f: string) => AGENT_LABELS[f] ?? f.replace(/_/g, " ");

    // Build daily agent users with total overlay
    const allUsersMap = new Map(dailyAllUsers.map((d) => [d.date, d.value]));
    const agentUsersOverTime = dailyAgentUsers.map((d) => ({
      date: d.date,
      agentUsers: d.value,
      totalUsers: allUsersMap.get(d.date) ?? 0,
    }));

    // Pivot agent mode by day
    const agentModePivoted = pivotByDate(agentModeByDay, "feature", "value", formatAgentFeature);

    // Weekly adoption rate
    const weeklyAdoptionRate = weeklyAgentAdoption.map((w) => ({
      date: w.date,
      rate: w.totalUsers > 0 ? Math.round((w.agentUsers / w.totalUsers) * 1000) / 10 : 0,
      agentUsers: w.agentUsers,
      totalUsers: w.totalUsers,
    }));

    // Resolve display names for top agent users
    const agentLogins = topAgentUsers.map((u) => u.userLogin);
    const { token } = await getGitHubConfig();
    const displayNameMap = token
      ? await resolveDisplayNames(agentLogins, token)
      : new Map<string, string>();
    const topAgentUsersWithNames = topAgentUsers.map((u) => ({
      ...u,
      displayLabel: formatUserLabel(u.userLogin, displayNameMap),
    }));

    return NextResponse.json({
      period: { start: startDate, end: endDate },
      kpis: {
        activeUsers: kpi.activeUsers,
        agentUsers: kpi.agentUsers,
        agentAdoptionRate: kpi.activeUsers > 0
          ? Math.round((kpi.agentUsers / kpi.activeUsers) * 100)
          : 0,
        agentCodeGen: kpi.agentCodeGen,
        agentCodeAccept: kpi.agentCodeAccept,
        agentAcceptanceRate: kpi.agentCodeGen > 0
          ? Math.round((kpi.agentCodeAccept / kpi.agentCodeGen) * 1000) / 10
          : 0,
        totalCodeGen: kpi.totalCodeGen,
        agentLocAdded: kpi.totalLocAdded,
      },
      agentUsersOverTime,
      agentModeByDay: agentModePivoted,
      agentModelUsage: agentModelUsage as Array<{ name: string; value: number }>,
      agentVsNonAgentCodeGen,
      weeklyAdoptionRate,
      topAgentUsers: topAgentUsersWithNames,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Agent Metrics API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function pivotByDate(
  rows: Array<{ date: string; [key: string]: string | number }>,
  catKey: string,
  valKey: string,
  labelFn: (s: string) => string = (s) => s
): Array<Record<string, string | number>> {
  const map = new Map<string, Record<string, string | number>>();
  for (const row of rows) {
    const d = String(row.date);
    if (!map.has(d)) map.set(d, { date: d });
    const entry = map.get(d)!;
    entry[labelFn(String(row[catKey]))] = Number(row[valKey]);
  }
  return Array.from(map.values());
}
