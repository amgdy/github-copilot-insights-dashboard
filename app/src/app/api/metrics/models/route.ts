import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dimModel, factUserModelDaily, dimFeature } from "@/lib/db/schema";
import { sql, and, gte, lte, eq, desc } from "drizzle-orm";
import { daysAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const days = Math.min(
      Math.max(parseInt(params.get("days") ?? "28", 10) || 28, 1),
      365
    );
    const startDate = daysAgo(days);
    const endDate = new Date().toISOString().split("T")[0];

    // All models from dimension table
    const allModels = await db
      .select({
        modelId: dimModel.modelId,
        modelName: dimModel.modelName,
        isPremium: dimModel.isPremium,
        isEnabled: dimModel.isEnabled,
        createdAt: dimModel.createdAt,
      })
      .from(dimModel)
      .orderBy(dimModel.modelName);

    // Usage stats per model in the chosen period
    const modelStats = await db
      .select({
        modelId: factUserModelDaily.modelId,
        totalInteractions: sql<number>`COALESCE(SUM(${factUserModelDaily.userInitiatedInteractionCount}), 0)`,
        totalCodeGen: sql<number>`COALESCE(SUM(${factUserModelDaily.codeGenerationActivityCount}), 0)`,
        uniqueUsers: sql<number>`COUNT(DISTINCT ${factUserModelDaily.userId})`,
        activeDays: sql<number>`COUNT(DISTINCT ${factUserModelDaily.day})`,
        firstSeen: sql<string>`MIN(${factUserModelDaily.day})`,
        lastSeen: sql<string>`MAX(${factUserModelDaily.day})`,
      })
      .from(factUserModelDaily)
      .where(
        and(
          gte(factUserModelDaily.day, startDate),
          lte(factUserModelDaily.day, endDate)
        )
      )
      .groupBy(factUserModelDaily.modelId);

    const statsMap = new Map(
      modelStats.map((s) => [s.modelId, s])
    );

    // Model × Feature breakdown
    const modelFeatureUsage = await db
      .select({
        modelId: factUserModelDaily.modelId,
        featureName: dimFeature.featureName,
        totalRequests: sql<number>`COALESCE(SUM(${factUserModelDaily.userInitiatedInteractionCount}) + SUM(${factUserModelDaily.codeGenerationActivityCount}), 0)`,
      })
      .from(factUserModelDaily)
      .innerJoin(dimFeature, eq(factUserModelDaily.featureId, dimFeature.featureId))
      .where(
        and(
          gte(factUserModelDaily.day, startDate),
          lte(factUserModelDaily.day, endDate)
        )
      )
      .groupBy(factUserModelDaily.modelId, dimFeature.featureName)
      .orderBy(desc(sql`SUM(${factUserModelDaily.userInitiatedInteractionCount}) + SUM(${factUserModelDaily.codeGenerationActivityCount})`));

    // Build feature map per model
    const featureMap = new Map<number, Record<string, number>>();
    for (const row of modelFeatureUsage) {
      if (!featureMap.has(row.modelId)) featureMap.set(row.modelId, {});
      featureMap.get(row.modelId)![row.featureName] = Number(row.totalRequests);
    }

    // Combine into response
    const models = allModels.map((m) => {
      const stats = statsMap.get(m.modelId);
      return {
        modelName: m.modelName,
        isPremium: m.isPremium,
        isEnabled: m.isEnabled ?? true,
        tier: m.isPremium ? "premium" : "included",
        createdAt: m.createdAt,
        usage: stats
          ? {
              totalInteractions: Number(stats.totalInteractions),
              totalCodeGen: Number(stats.totalCodeGen),
              totalRequests:
                Number(stats.totalInteractions) + Number(stats.totalCodeGen),
              uniqueUsers: Number(stats.uniqueUsers),
              activeDays: Number(stats.activeDays),
              firstSeen: stats.firstSeen,
              lastSeen: stats.lastSeen,
            }
          : null,
        featureBreakdown: featureMap.get(m.modelId) ?? {},
      };
    });

    return NextResponse.json({
      period: { start: startDate, end: endDate, days },
      models,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch models data";
    console.error("Models API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
