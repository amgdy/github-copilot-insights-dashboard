import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { factOrgAggregateDaily, dimOrg } from "@/lib/db/schema";
import { sql, and, gte, lte, eq, inArray } from "drizzle-orm";
import { daysAgo, isValidDate } from "@/lib/utils";
import { z } from "zod";

const querySchema = z.object({
  days: z.coerce.number().int().positive().optional(),
  start: z.string().refine(isValidDate).optional(),
  end: z.string().refine(isValidDate).optional(),
  orgId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const params = querySchema.parse({
      days: sp.get("days") ?? undefined,
      start: sp.get("start") ?? undefined,
      end: sp.get("end") ?? undefined,
      orgId: sp.get("orgId") ?? undefined,
    });

    const startDate = params.start ?? daysAgo(params.days ?? 28);
    const endDate = params.end ?? daysAgo(0);

    const conditions = [
      gte(factOrgAggregateDaily.day, startDate),
      lte(factOrgAggregateDaily.day, endDate),
    ];

    if (params.orgId) {
      const orgIds = params.orgId.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
      if (orgIds.length === 1) conditions.push(eq(factOrgAggregateDaily.orgId, orgIds[0]));
      else if (orgIds.length > 1) conditions.push(inArray(factOrgAggregateDaily.orgId, orgIds));
    }

    // Daily PR metrics
    const dailyMetrics = await db
      .select({
        day: factOrgAggregateDaily.day,
        orgId: factOrgAggregateDaily.orgId,
        scope: factOrgAggregateDaily.scope,
        dailyActiveUsers: factOrgAggregateDaily.dailyActiveUsers,
        prTotalCreated: factOrgAggregateDaily.prTotalCreated,
        prTotalReviewed: factOrgAggregateDaily.prTotalReviewed,
        prTotalMerged: factOrgAggregateDaily.prTotalMerged,
        prMedianMinutesToMerge: factOrgAggregateDaily.prMedianMinutesToMerge,
        prTotalCreatedByCopilot: factOrgAggregateDaily.prTotalCreatedByCopilot,
        prTotalReviewedByCopilot: factOrgAggregateDaily.prTotalReviewedByCopilot,
        prTotalMergedCreatedByCopilot: factOrgAggregateDaily.prTotalMergedCreatedByCopilot,
        prMedianMinutesToMergeCopilotAuthored: factOrgAggregateDaily.prMedianMinutesToMergeCopilotAuthored,
        prTotalSuggestions: factOrgAggregateDaily.prTotalSuggestions,
        prTotalAppliedSuggestions: factOrgAggregateDaily.prTotalAppliedSuggestions,
        prTotalCopilotSuggestions: factOrgAggregateDaily.prTotalCopilotSuggestions,
        prTotalCopilotAppliedSuggestions: factOrgAggregateDaily.prTotalCopilotAppliedSuggestions,
      })
      .from(factOrgAggregateDaily)
      .where(and(...conditions))
      .orderBy(factOrgAggregateDaily.day);

    // Aggregate totals across the period
    const [totals] = await db
      .select({
        totalCreated: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalCreated}), 0)`,
        totalReviewed: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalReviewed}), 0)`,
        totalMerged: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalMerged}), 0)`,
        totalCreatedByCopilot: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalCreatedByCopilot}), 0)`,
        totalReviewedByCopilot: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalReviewedByCopilot}), 0)`,
        totalMergedCreatedByCopilot: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalMergedCreatedByCopilot}), 0)`,
        totalMergedReviewedByCopilot: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalMergedReviewedByCopilot}), 0)`,
        totalSuggestions: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalSuggestions}), 0)`,
        totalAppliedSuggestions: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalAppliedSuggestions}), 0)`,
        totalCopilotSuggestions: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalCopilotSuggestions}), 0)`,
        totalCopilotAppliedSuggestions: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalCopilotAppliedSuggestions}), 0)`,
        avgMedianMinutesToMerge: sql<number>`avg(${factOrgAggregateDaily.prMedianMinutesToMerge}::numeric)`,
        avgMedianMinutesToMergeCopilot: sql<number>`avg(${factOrgAggregateDaily.prMedianMinutesToMergeCopilotAuthored}::numeric)`,
        avgMedianMinutesToMergeCopilotReviewed: sql<number>`avg(${factOrgAggregateDaily.prMedianMinutesToMergeCopilotReviewed}::numeric)`,
      })
      .from(factOrgAggregateDaily)
      .where(and(...conditions));

    // Per-org breakdown
    const orgBreakdown = await db
      .select({
        orgId: factOrgAggregateDaily.orgId,
        orgName: dimOrg.orgName,
        totalCreated: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalCreated}), 0)`,
        totalMerged: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalMerged}), 0)`,
        totalCreatedByCopilot: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalCreatedByCopilot}), 0)`,
        totalMergedCreatedByCopilot: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalMergedCreatedByCopilot}), 0)`,
        totalReviewedByCopilot: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalReviewedByCopilot}), 0)`,
        totalCopilotSuggestions: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalCopilotSuggestions}), 0)`,
        totalCopilotAppliedSuggestions: sql<number>`coalesce(sum(${factOrgAggregateDaily.prTotalCopilotAppliedSuggestions}), 0)`,
      })
      .from(factOrgAggregateDaily)
      .leftJoin(dimOrg, eq(factOrgAggregateDaily.orgId, dimOrg.orgId))
      .where(and(...conditions))
      .groupBy(factOrgAggregateDaily.orgId, dimOrg.orgName);

    return NextResponse.json({
      daily: dailyMetrics,
      totals: totals ?? {},
      orgBreakdown,
    });
  } catch (error) {
    console.error("Failed to fetch PR metrics:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
