import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { factCopilotUsageDaily, rawCopilotUsage, dimUser } from "@/lib/db/schema";
import { sql, and, gte, lte, eq, inArray } from "drizzle-orm";
import { daysAgo, isValidDate } from "@/lib/utils";
import { z } from "zod";

const querySchema = z.object({
  days: z.coerce.number().int().positive().optional(),
  start: z.string().refine(isValidDate).optional(),
  end: z.string().refine(isValidDate).optional(),
  userId: z.coerce.number().int().optional(),
});

/** Agent-initiated feature names */
const AGENT_FEATURES = [
  "chat_panel_agent_mode",
  "chat_panel_edit_mode",
  "chat_panel_custom_mode",
  "agent_edit",
];

/** Feature display labels */
const FEATURE_LABELS: Record<string, string> = {
  code_completion: "Completions",
  chat_panel_ask_mode: "Ask",
  chat_panel_inline_mode: "Inline",
  chat_panel_edit_mode: "Edit",
  chat_panel_agent_mode: "Agent",
  chat_panel_custom_mode: "Custom",
  chat_panel_plan_mode: "Plan",
  agent_edit: "Agent Edit",
};

function featureLabel(f: string): string {
  return FEATURE_LABELS[f] ?? f;
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const params = querySchema.parse({
      days: sp.get("days") ?? undefined,
      start: sp.get("start") ?? undefined,
      end: sp.get("end") ?? undefined,
      userId: sp.get("userId") ?? undefined,
    });

    const endDate = params.end ?? new Date().toISOString().split("T")[0];
    const startDate = params.start ?? daysAgo(params.days ?? 28);

    // Resolve user filter
    let userIds: number[] | null = null;
    if (params.userId) userIds = [params.userId];

    // WHERE helpers
    const factWhere = () => {
      const conds = [
        gte(factCopilotUsageDaily.day, startDate),
        lte(factCopilotUsageDaily.day, endDate),
      ];
      if (userIds) conds.push(inArray(factCopilotUsageDaily.userId, userIds));
      return and(...conds);
    };

    const userFilter = userIds ? sql`AND r.user_id = ANY(ARRAY[${sql.join(userIds.map((id) => sql`${id}`), sql`, `)}])` : sql``;

    const [
      dailyTotals,
      kpiResult,
      agentKpi,
      byFeatureRaw,
      byModelFeatureRaw,
      byLangFeatureRaw,
    ] = await Promise.all([
      // 1. Daily totals (added/deleted) from fact table
      db
        .select({
          date: factCopilotUsageDaily.day,
          added: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.locAddedSum}), 0)`,
          deleted: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.locDeletedSum}), 0)`,
        })
        .from(factCopilotUsageDaily)
        .where(factWhere())
        .groupBy(factCopilotUsageDaily.day)
        .orderBy(factCopilotUsageDaily.day),

      // 2. KPI totals
      db
        .select({
          totalAdded: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.locAddedSum}), 0)`,
          totalDeleted: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.locDeletedSum}), 0)`,
          totalSuggestedAdd: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.locSuggestedToAddSum}), 0)`,
          totalSuggestedDelete: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.locSuggestedToDeleteSum}), 0)`,
          activeUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId})`,
        })
        .from(factCopilotUsageDaily)
        .where(factWhere()),

      // 3. Agent-specific KPIs
      db
        .select({
          agentAdded: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.locAddedSum}), 0)`,
          agentDeleted: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.locDeletedSum}), 0)`,
          agentUsers: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.userId})`,
        })
        .from(factCopilotUsageDaily)
        .where(and(factWhere(), eq(factCopilotUsageDaily.usedAgent, true))),

      // 4. By feature from raw JSON
      db.execute(sql`
        SELECT
          f->>'feature' as feature,
          COALESCE(SUM((f->>'loc_suggested_to_add_sum')::bigint), 0)::bigint as suggested_add,
          COALESCE(SUM((f->>'loc_suggested_to_delete_sum')::bigint), 0)::bigint as suggested_delete,
          COALESCE(SUM((f->>'loc_added_sum')::bigint), 0)::bigint as added,
          COALESCE(SUM((f->>'loc_deleted_sum')::bigint), 0)::bigint as deleted
        FROM raw_copilot_usage r,
          jsonb_array_elements(r.raw_json->'totals_by_feature') as f
        WHERE r.report_date >= ${startDate} AND r.report_date <= ${endDate}
          ${userFilter}
        GROUP BY f->>'feature'
        ORDER BY COALESCE(SUM((f->>'loc_added_sum')::bigint), 0) DESC
      `),

      // 5. By model×feature from raw JSON
      db.execute(sql`
        SELECT
          mf->>'model' as model,
          mf->>'feature' as feature,
          COALESCE(SUM((mf->>'loc_suggested_to_add_sum')::bigint), 0)::bigint as suggested_add,
          COALESCE(SUM((mf->>'loc_added_sum')::bigint), 0)::bigint as added,
          COALESCE(SUM((mf->>'loc_deleted_sum')::bigint), 0)::bigint as deleted
        FROM raw_copilot_usage r,
          jsonb_array_elements(r.raw_json->'totals_by_model_feature') as mf
        WHERE r.report_date >= ${startDate} AND r.report_date <= ${endDate}
          ${userFilter}
        GROUP BY mf->>'model', mf->>'feature'
      `),

      // 6. By language×feature from raw JSON
      db.execute(sql`
        SELECT
          lf->>'language' as language,
          lf->>'feature' as feature,
          COALESCE(SUM((lf->>'loc_suggested_to_add_sum')::bigint), 0)::bigint as suggested_add,
          COALESCE(SUM((lf->>'loc_added_sum')::bigint), 0)::bigint as added,
          COALESCE(SUM((lf->>'loc_deleted_sum')::bigint), 0)::bigint as deleted
        FROM raw_copilot_usage r,
          jsonb_array_elements(r.raw_json->'totals_by_language_feature') as lf
        WHERE r.report_date >= ${startDate} AND r.report_date <= ${endDate}
          ${userFilter}
        GROUP BY lf->>'language', lf->>'feature'
      `),
    ]);

    // ── Shape KPIs ──
    const kpi = kpiResult[0];
    const agent = agentKpi[0];
    const totalLocChanged = Number(kpi.totalAdded) + Number(kpi.totalDeleted);
    const agentLocChanged = Number(agent.agentAdded) + Number(agent.agentDeleted);
    const agentContribution = totalLocChanged > 0
      ? Math.round((agentLocChanged / totalLocChanged) * 1000) / 10
      : 0;
    const avgLinesDeletedByAgent = Number(agent.agentUsers) > 0
      ? Math.round(Number(agent.agentDeleted) / Number(agent.agentUsers))
      : 0;

    // ── Shape feature data ──
    const byFeature = (byFeatureRaw as unknown as Array<Record<string, string | number>>);

    const userInitiatedByFeature = byFeature.map((r) => ({
      feature: featureLabel(String(r.feature)),
      suggested: Number(r.suggested_add),
      added: Number(r.added),
    })).sort((a, b) => b.suggested + b.added - a.suggested - a.added);

    const agentInitiatedByFeature = byFeature
      .filter((r) => AGENT_FEATURES.includes(String(r.feature)))
      .map((r) => ({
        feature: featureLabel(String(r.feature)),
        added: Number(r.added),
        deleted: Number(r.deleted),
      }))
      .sort((a, b) => b.added + b.deleted - a.added - a.deleted);

    // ── Shape model data ──
    const byModelFeature = (byModelFeatureRaw as unknown as Array<Record<string, string | number>>);

    // Group by model, split user vs agent
    const modelUserMap = new Map<string, { suggested: number; added: number }>();
    const modelAgentMap = new Map<string, { added: number; deleted: number }>();

    for (const r of byModelFeature) {
      const model = String(r.model);
      const isAgent = AGENT_FEATURES.includes(String(r.feature));

      if (!isAgent) {
        const prev = modelUserMap.get(model) ?? { suggested: 0, added: 0 };
        prev.suggested += Number(r.suggested_add);
        prev.added += Number(r.added);
        modelUserMap.set(model, prev);
      } else {
        const prev = modelAgentMap.get(model) ?? { added: 0, deleted: 0 };
        prev.added += Number(r.added);
        prev.deleted += Number(r.deleted);
        modelAgentMap.set(model, prev);
      }
    }

    const userInitiatedByModel = Array.from(modelUserMap.entries())
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.suggested + b.added - a.suggested - a.added)
      .slice(0, 10);

    // Add "Other models" if truncated
    if (modelUserMap.size > 10) {
      const all = Array.from(modelUserMap.entries()).sort((a, b) =>
        b[1].suggested + b[1].added - a[1].suggested - a[1].added
      );
      const rest = all.slice(10);
      const other = rest.reduce(
        (acc, [, v]) => ({ suggested: acc.suggested + v.suggested, added: acc.added + v.added }),
        { suggested: 0, added: 0 }
      );
      if (other.suggested + other.added > 0) {
        userInitiatedByModel.push({ model: "Other models", ...other });
      }
    }

    const agentInitiatedByModel = Array.from(modelAgentMap.entries())
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.added + b.deleted - a.added - a.deleted)
      .slice(0, 10);

    if (modelAgentMap.size > 10) {
      const all = Array.from(modelAgentMap.entries()).sort((a, b) =>
        b[1].added + b[1].deleted - a[1].added - a[1].deleted
      );
      const rest = all.slice(10);
      const other = rest.reduce(
        (acc, [, v]) => ({ added: acc.added + v.added, deleted: acc.deleted + v.deleted }),
        { added: 0, deleted: 0 }
      );
      if (other.added + other.deleted > 0) {
        agentInitiatedByModel.push({ model: "Other models", ...other });
      }
    }

    // ── Shape language data ──
    const byLangFeature = (byLangFeatureRaw as unknown as Array<Record<string, string | number>>);

    const langUserMap = new Map<string, { suggested: number; added: number }>();
    const langAgentMap = new Map<string, { added: number; deleted: number }>();

    for (const r of byLangFeature) {
      const lang = String(r.language);
      const isAgent = AGENT_FEATURES.includes(String(r.feature));

      if (!isAgent) {
        const prev = langUserMap.get(lang) ?? { suggested: 0, added: 0 };
        prev.suggested += Number(r.suggested_add);
        prev.added += Number(r.added);
        langUserMap.set(lang, prev);
      } else {
        const prev = langAgentMap.get(lang) ?? { added: 0, deleted: 0 };
        prev.added += Number(r.added);
        prev.deleted += Number(r.deleted);
        langAgentMap.set(lang, prev);
      }
    }

    const topNLang = (map: Map<string, { suggested?: number; added: number; deleted?: number }>, n = 8) => {
      const entries = Array.from(map.entries()).sort((a, b) => {
        const aTotal = (b[1].suggested ?? 0) + b[1].added + (b[1].deleted ?? 0);
        const bTotal = (a[1].suggested ?? 0) + a[1].added + (a[1].deleted ?? 0);
        return aTotal - bTotal;
      });
      if (entries.length <= n) return entries;
      const top = entries.slice(0, n);
      const rest = entries.slice(n);
      return top;
    };

    const userLangEntries = topNLang(langUserMap as Map<string, { suggested?: number; added: number; deleted?: number }>);
    const userInitiatedByLanguage = userLangEntries.map(([language, v]) => ({
      language,
      suggested: (v as { suggested: number; added: number }).suggested,
      added: v.added,
    }));

    // Add "Other languages" bucket
    if (langUserMap.size > 8) {
      const sorted = Array.from(langUserMap.entries()).sort(
        (a, b) => b[1].suggested + b[1].added - a[1].suggested - a[1].added
      );
      const rest = sorted.slice(8);
      const other = rest.reduce(
        (acc, [, v]) => ({ suggested: acc.suggested + v.suggested, added: acc.added + v.added }),
        { suggested: 0, added: 0 }
      );
      if (other.suggested + other.added > 0) {
        userInitiatedByLanguage.push({ language: "Other languages", ...other });
      }
    }

    const agentLangEntries = Array.from(langAgentMap.entries())
      .sort((a, b) => b[1].added + b[1].deleted - a[1].added - a[1].deleted)
      .slice(0, 8);
    const agentInitiatedByLanguage = agentLangEntries.map(([language, v]) => ({
      language,
      ...v,
    }));

    if (langAgentMap.size > 8) {
      const sorted = Array.from(langAgentMap.entries()).sort(
        (a, b) => b[1].added + b[1].deleted - a[1].added - a[1].deleted
      );
      const rest = sorted.slice(8);
      const other = rest.reduce(
        (acc, [, v]) => ({ added: acc.added + v.added, deleted: acc.deleted + v.deleted }),
        { added: 0, deleted: 0 }
      );
      if (other.added + other.deleted > 0) {
        agentInitiatedByLanguage.push({ language: "Other languages", ...other });
      }
    }

    return NextResponse.json({
      period: { start: startDate, end: endDate, days: params.days ?? 28 },
      kpis: {
        totalLocChanged,
        agentContribution,
        avgLinesDeletedByAgent,
      },
      dailyTotals,
      userInitiatedByFeature,
      agentInitiatedByFeature,
      userInitiatedByModel,
      agentInitiatedByModel,
      userInitiatedByLanguage,
      agentInitiatedByLanguage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Code generation API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
