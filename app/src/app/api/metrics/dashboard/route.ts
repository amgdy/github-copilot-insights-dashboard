import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  factCopilotUsageDaily,
  factUserFeatureDaily,
  factUserModelDaily,
  factUserLanguageDaily,
  factUserLanguageModelDaily,
  dimFeature,
  dimModel,
  dimLanguage,
  dimUser,
} from "@/lib/db/schema";
import { sql, and, gte, lte, eq, inArray } from "drizzle-orm";
import { daysAgo, isValidDate } from "@/lib/utils";
import { z } from "zod";
import { safeErrorMessage } from "@/lib/auth";

const querySchema = z.object({
  days: z.coerce.number().int().positive().optional(),
  start: z.string().refine(isValidDate).optional(),
  end: z.string().refine(isValidDate).optional(),
  userId: z.coerce.number().int().optional(),
  teamName: z.string().optional(),
  orgId: z.string().optional(),
});

/** Parse comma-separated org IDs into number array. */
function parseOrgIds(orgId?: string): number[] {
  if (!orgId) return [];
  return orgId.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
}

/** Build a list of userIds to filter by (from team/org/user filters). Returns null if no filter. */
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

    // Helper: build WHERE conditions for the main fact table
    const mainWhere = () => {
      const conds = [
        gte(factCopilotUsageDaily.day, startDate),
        lte(factCopilotUsageDaily.day, endDate),
      ];
      if (userIds) conds.push(inArray(factCopilotUsageDaily.userId, userIds));
      return and(...conds);
    };

    // Helper: build WHERE for feature table with date range
    const featureWhere = (extra?: ReturnType<typeof eq>) => {
      const conds: ReturnType<typeof eq>[] = [
        gte(factUserFeatureDaily.day, startDate),
        lte(factUserFeatureDaily.day, endDate),
      ];
      if (userIds) conds.push(inArray(factUserFeatureDaily.userId, userIds));
      if (extra) conds.push(extra);
      return and(...conds);
    };

    // Run all queries in parallel
    const [
      kpiResult,
      totalUsersResult,
      dailyActive,
      weeklyActive,
      avgChatPerDay,
      chatModeByDay,
      completionsByDay,
      modelByDay,
      modelTotal,
      modelByFeature,
      langByDay,
      langTotal,
      langModelData,
    ] = await Promise.all([
      // 1. KPI aggregates
      db
        .select({
          activeUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId})`,
          totalInteractions: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.userInitiatedInteractionCount}), 0)`,
          totalCodeGen: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeGenerationActivityCount}), 0)`,
          totalCodeAccept: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeAcceptanceActivityCount}), 0)`,
          agentUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId}) FILTER (WHERE ${factCopilotUsageDaily.usedAgent} = true)`,
          chatUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId}) FILTER (WHERE ${factCopilotUsageDaily.usedChat} = true)`,
          cliUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId}) FILTER (WHERE ${factCopilotUsageDaily.usedCli} = true)`,
        })
        .from(factCopilotUsageDaily)
        .where(mainWhere()),

      // 1b. Total Copilot users (all current users in dim_user)
      db
        .select({
          totalUsers: sql<number>`COUNT(DISTINCT ${dimUser.userId})`,
        })
        .from(dimUser)
        .where((() => {
          const conds = [eq(dimUser.isCurrent, true)];
          if (userIds) conds.push(inArray(dimUser.userId, userIds));
          return and(...conds);
        })()),

      // 2. Daily active users
      db
        .select({
          date: factCopilotUsageDaily.day,
          value: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId})`,
        })
        .from(factCopilotUsageDaily)
        .where(mainWhere())
        .groupBy(factCopilotUsageDaily.day)
        .orderBy(factCopilotUsageDaily.day),

      // 3. Weekly active users
      db
        .select({
          date: sql<string>`DATE_TRUNC('week', ${factCopilotUsageDaily.day}::date)::date::text`,
          value: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId})`,
        })
        .from(factCopilotUsageDaily)
        .where(mainWhere())
        .groupBy(sql`DATE_TRUNC('week', ${factCopilotUsageDaily.day}::date)`)
        .orderBy(sql`DATE_TRUNC('week', ${factCopilotUsageDaily.day}::date)`),

      // 4. Average chat requests per active user per day
      db
        .select({
          date: factCopilotUsageDaily.day,
          value: sql<number>`ROUND(SUM(${factCopilotUsageDaily.userInitiatedInteractionCount})::numeric / NULLIF(COUNT(DISTINCT ${factCopilotUsageDaily.userId}), 0), 2)`,
        })
        .from(factCopilotUsageDaily)
        .where(mainWhere())
        .groupBy(factCopilotUsageDaily.day)
        .orderBy(factCopilotUsageDaily.day),

      // 5. Requests per chat mode (feature breakdown by day)
      db
        .select({
          date: factUserFeatureDaily.day,
          feature: dimFeature.featureName,
          value: sql<number>`COALESCE(SUM(${factUserFeatureDaily.userInitiatedInteractionCount}), 0)`,
        })
        .from(factUserFeatureDaily)
        .innerJoin(dimFeature, eq(factUserFeatureDaily.featureId, dimFeature.featureId))
        .where(featureWhere())
        .groupBy(factUserFeatureDaily.day, dimFeature.featureName)
        .orderBy(factUserFeatureDaily.day),

      // 6. Code completions by day (code_completion feature)
      db
        .select({
          date: factUserFeatureDaily.day,
          suggested: sql<number>`COALESCE(SUM(${factUserFeatureDaily.codeGenerationActivityCount}), 0)`,
          accepted: sql<number>`COALESCE(SUM(${factUserFeatureDaily.codeAcceptanceActivityCount}), 0)`,
        })
        .from(factUserFeatureDaily)
        .innerJoin(dimFeature, eq(factUserFeatureDaily.featureId, dimFeature.featureId))
        .where(featureWhere(eq(dimFeature.featureName, "code_completion")))
        .groupBy(factUserFeatureDaily.day)
        .orderBy(factUserFeatureDaily.day),

      // 7. Model usage by day
      db
        .select({
          date: factUserModelDaily.day,
          model: dimModel.modelName,
          value: sql<number>`COALESCE(SUM(${factUserModelDaily.userInitiatedInteractionCount}) + SUM(${factUserModelDaily.codeGenerationActivityCount}), 0)`,
        })
        .from(factUserModelDaily)
        .innerJoin(dimModel, eq(factUserModelDaily.modelId, dimModel.modelId))
        .where((() => {
          const conds = [
            gte(factUserModelDaily.day, startDate),
            lte(factUserModelDaily.day, endDate),
          ];
          if (userIds) conds.push(inArray(factUserModelDaily.userId, userIds));
          return and(...conds);
        })())
        .groupBy(factUserModelDaily.day, dimModel.modelName)
        .orderBy(factUserModelDaily.day),

      // 8. Total model usage (for donut)
      db
        .select({
          name: dimModel.modelName,
          value: sql<number>`COALESCE(SUM(${factUserModelDaily.userInitiatedInteractionCount}), 0)`,
        })
        .from(factUserModelDaily)
        .innerJoin(dimModel, eq(factUserModelDaily.modelId, dimModel.modelId))
        .where((() => {
          const conds = [
            gte(factUserModelDaily.day, startDate),
            lte(factUserModelDaily.day, endDate),
          ];
          if (userIds) conds.push(inArray(factUserModelDaily.userId, userIds));
          return and(...conds);
        })())
        .groupBy(dimModel.modelName)
        .orderBy(sql`SUM(${factUserModelDaily.userInitiatedInteractionCount}) DESC`),

      // 9. Model usage by feature (for model×chat mode chart)
      db
        .select({
          model: dimModel.modelName,
          feature: dimFeature.featureName,
          value: sql<number>`COALESCE(SUM(${factUserModelDaily.userInitiatedInteractionCount}), 0)`,
        })
        .from(factUserModelDaily)
        .innerJoin(dimModel, eq(factUserModelDaily.modelId, dimModel.modelId))
        .innerJoin(dimFeature, eq(factUserModelDaily.featureId, dimFeature.featureId))
        .where((() => {
          const conds = [
            gte(factUserModelDaily.day, startDate),
            lte(factUserModelDaily.day, endDate),
          ];
          if (userIds) conds.push(inArray(factUserModelDaily.userId, userIds));
          return and(...conds);
        })())
        .groupBy(dimModel.modelName, dimFeature.featureName),

      // 10. Language usage by day
      db
        .select({
          date: factUserLanguageDaily.day,
          language: dimLanguage.languageName,
          value: sql<number>`COALESCE(SUM(${factUserLanguageDaily.codeGenerationActivityCount}), 0)`,
        })
        .from(factUserLanguageDaily)
        .innerJoin(dimLanguage, eq(factUserLanguageDaily.languageId, dimLanguage.languageId))
        .where((() => {
          const conds = [
            gte(factUserLanguageDaily.day, startDate),
            lte(factUserLanguageDaily.day, endDate),
          ];
          if (userIds) conds.push(inArray(factUserLanguageDaily.userId, userIds));
          return and(...conds);
        })())
        .groupBy(factUserLanguageDaily.day, dimLanguage.languageName)
        .orderBy(factUserLanguageDaily.day),

      // 11. Total language usage (for donut)
      db
        .select({
          name: dimLanguage.languageName,
          value: sql<number>`COALESCE(SUM(${factUserLanguageDaily.codeGenerationActivityCount}), 0)`,
        })
        .from(factUserLanguageDaily)
        .innerJoin(dimLanguage, eq(factUserLanguageDaily.languageId, dimLanguage.languageId))
        .where((() => {
          const conds = [
            gte(factUserLanguageDaily.day, startDate),
            lte(factUserLanguageDaily.day, endDate),
          ];
          if (userIds) conds.push(inArray(factUserLanguageDaily.userId, userIds));
          return and(...conds);
        })())
        .groupBy(dimLanguage.languageName)
        .orderBy(sql`SUM(${factUserLanguageDaily.codeGenerationActivityCount}) DESC`),

      // 12. Language × Model usage
      db
        .select({
          language: dimLanguage.languageName,
          model: dimModel.modelName,
          value: sql<number>`COALESCE(SUM(${factUserLanguageModelDaily.codeGenerationActivityCount}), 0)`,
        })
        .from(factUserLanguageModelDaily)
        .innerJoin(dimLanguage, eq(factUserLanguageModelDaily.languageId, dimLanguage.languageId))
        .innerJoin(dimModel, eq(factUserLanguageModelDaily.modelId, dimModel.modelId))
        .where((() => {
          const conds = [
            gte(factUserLanguageModelDaily.day, startDate),
            lte(factUserLanguageModelDaily.day, endDate),
          ];
          if (userIds) conds.push(inArray(factUserLanguageModelDaily.userId, userIds));
          return and(...conds);
        })())
        .groupBy(dimLanguage.languageName, dimModel.modelName),
    ]);

    const kpi = kpiResult[0];
    const totalCopilotUsers = totalUsersResult[0]?.totalUsers ?? 0;

    // Find most used chat model
    const topModel = modelTotal.length > 0 ? String(modelTotal[0].name) : "N/A";

    // ── Shape chat mode data into pivoted rows ──
    const CHAT_MODE_LABELS: Record<string, string> = {
      chat_panel_edit_mode: "Edit",
      chat_panel_ask_mode: "Ask",
      chat_panel_agent_mode: "Agent",
      chat_panel_custom_mode: "Custom",
      chat_panel_inline_mode: "Inline",
      chat_panel_plan_mode: "Plan",
      agent_edit: "Agent Edit",
      code_completion: "Completions",
    };
    const formatFeature = (f: string) => CHAT_MODE_LABELS[f] ?? f;

    // Pivot chatModeByDay: [{date, feature, value}] → [{date, Agent: n, Edit: n, ...}]
    const chatModePivoted = pivotByDate(chatModeByDay, "feature", "value", formatFeature);

    // Pivot modelByDay
    const modelByDayPivoted = pivotByDate(modelByDay, "model", "value");

    // Pivot langByDay
    const langByDayPivoted = pivotByDate(langByDay, "language", "value");

    // Pivot model×feature: [{model, feature, value}] → [{model, Agent: n, ...}]
    const modelByFeaturePivoted = pivotByKey(modelByFeature, "model", "feature", "value", formatFeature);

    // Pivot language×model: [{language, model, value}] → [{language, gpt-5.4: n, ...}]
    const langModelPivoted = pivotByKey(langModelData, "language", "model", "value");

    return NextResponse.json({
      period: { start: startDate, end: endDate },
      kpis: {
        activeUsers: kpi.activeUsers,
        totalCopilotUsers,
        agentUsers: kpi.agentUsers,
        agentAdoptionRate: kpi.activeUsers > 0
          ? Math.round((kpi.agentUsers / kpi.activeUsers) * 100)
          : 0,
        chatUsers: kpi.chatUsers,
        cliUsers: kpi.cliUsers,
        totalInteractions: kpi.totalInteractions,
        totalCodeGen: kpi.totalCodeGen,
        totalCodeAccept: kpi.totalCodeAccept,
        mostUsedChatModel: topModel,
      },
      dailyActiveUsers: dailyActive,
      weeklyActiveUsers: weeklyActive,
      avgChatRequestsPerUser: avgChatPerDay,
      requestsPerChatMode: chatModePivoted,
      codeCompletions: completionsByDay,
      modelUsagePerDay: modelByDayPivoted,
      chatModelUsage: modelTotal.map((m) => ({ name: m.name, value: m.value })),
      modelUsagePerChatMode: modelByFeaturePivoted,
      languageUsagePerDay: langByDayPivoted,
      languageUsage: langTotal,
      modelUsagePerLanguage: langModelPivoted,
    });
  } catch (err) {
    console.error("Dashboard API error:", err);
    return NextResponse.json({ error: safeErrorMessage(err, "Internal server error") }, { status: 500 });
  }
}

// ── Pivot helpers ──

/** Pivot rows with a date + category into {date, [cat1]: val, [cat2]: val, ...} */
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

/** Pivot rows with a primary key + category into {key, [cat1]: val, [cat2]: val, ...} */
function pivotByKey(
  rows: Array<Record<string, string | number>>,
  primaryKey: string,
  catKey: string,
  valKey: string,
  labelFn: (s: string) => string = (s) => s,
  pkLabelFn: (s: string) => string = (s) => s
): Array<Record<string, string | number>> {
  const map = new Map<string, Record<string, string | number>>();
  for (const row of rows) {
    const pk = String(row[primaryKey]);
    const pkLabel = pkLabelFn(pk);
    if (!map.has(pkLabel)) map.set(pkLabel, { name: pkLabel });
    const entry = map.get(pkLabel)!;
    entry[labelFn(String(row[catKey]))] = (Number(entry[labelFn(String(row[catKey]))]) || 0) + Number(row[valKey]);
  }
  return Array.from(map.values());
}
