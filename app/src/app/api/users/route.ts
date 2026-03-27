import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { factCopilotUsageDaily, dimUser, dimOrg } from "@/lib/db/schema";
import { sql, and, gte, lte, eq, ilike } from "drizzle-orm";
import { daysAgo, isValidDate } from "@/lib/utils";
import { z } from "zod";
import { getGitHubConfig } from "@/lib/db/settings";
import { resolveDisplayNames, formatUserLabel } from "@/lib/github/resolve-display-names";

const querySchema = z.object({
  start: z.string().refine(isValidDate).optional(),
  end: z.string().refine(isValidDate).optional(),
  days: z.coerce.number().int().positive().optional(),
  search: z.string().max(100).optional(),
  orgId: z.coerce.number().int().optional(),
  segment: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  sortBy: z.enum(["interactions", "acceptance_rate", "days_active", "last_active"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const params = querySchema.parse({
      start: searchParams.get("start") ?? undefined,
      end: searchParams.get("end") ?? undefined,
      days: searchParams.get("days") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      orgId: searchParams.get("orgId") ?? undefined,
      segment: searchParams.get("segment") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
      sortBy: searchParams.get("sortBy") ?? undefined,
      sortDir: searchParams.get("sortDir") ?? undefined,
    });

    const endDate = params.end ?? new Date().toISOString().split("T")[0];
    const startDate = params.start ?? daysAgo(params.days ?? 28);
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    const conditions = [
      gte(factCopilotUsageDaily.day, startDate),
      lte(factCopilotUsageDaily.day, endDate),
    ];

    if (params.orgId) {
      conditions.push(eq(factCopilotUsageDaily.orgId, params.orgId));
    }

    const users = await db
      .select({
        userId: factCopilotUsageDaily.userId,
        userLogin: factCopilotUsageDaily.userLogin,
        daysActive: sql<number>`COUNT(DISTINCT ${factCopilotUsageDaily.day})`,
        totalInteractions: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.userInitiatedInteractionCount}), 0)`,
        totalCodeGen: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeGenerationActivityCount}), 0)`,
        totalCodeAccept: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.codeAcceptanceActivityCount}), 0)`,
        usedAgent: sql<boolean>`BOOL_OR(${factCopilotUsageDaily.usedAgent})`,
        usedChat: sql<boolean>`BOOL_OR(${factCopilotUsageDaily.usedChat})`,
        usedCli: sql<boolean>`BOOL_OR(${factCopilotUsageDaily.usedCli})`,
        lastActiveDate: sql<string>`MAX(${factCopilotUsageDaily.day})`,
        locAdded: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.locAddedSum}), 0)`,
        locDeleted: sql<number>`COALESCE(SUM(${factCopilotUsageDaily.locDeletedSum}), 0)`,
      })
      .from(factCopilotUsageDaily)
      .where(and(...conditions))
      .groupBy(factCopilotUsageDaily.userId, factCopilotUsageDaily.userLogin)
      .orderBy(
        params.sortBy === "days_active"
          ? sql`COUNT(DISTINCT ${factCopilotUsageDaily.day}) ${sql.raw(params.sortDir === "asc" ? "ASC" : "DESC")}`
          : params.sortBy === "acceptance_rate"
            ? sql`CASE WHEN SUM(${factCopilotUsageDaily.codeGenerationActivityCount}) > 0 THEN SUM(${factCopilotUsageDaily.codeAcceptanceActivityCount})::NUMERIC / SUM(${factCopilotUsageDaily.codeGenerationActivityCount}) ELSE 0 END ${sql.raw(params.sortDir === "asc" ? "ASC" : "DESC")}`
            : sql`COALESCE(SUM(${factCopilotUsageDaily.userInitiatedInteractionCount}), 0) ${sql.raw(params.sortDir === "asc" ? "ASC" : "DESC")}`
      )
      .limit(limit)
      .offset(offset);

    // Filter by search term in application layer for safety
    let filtered = users;
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      filtered = users.filter((u) =>
        u.userLogin.toLowerCase().includes(searchLower)
      );
    }

    // Resolve display names from GitHub
    const logins = filtered.map((u) => u.userLogin);
    const { token } = await getGitHubConfig();
    const displayNameMap = token
      ? await resolveDisplayNames(logins, token)
      : new Map<string, string>();

    const result = filtered.map((u) => ({
      userId: u.userId,
      userLogin: u.userLogin,
      displayLabel: formatUserLabel(u.userLogin, displayNameMap),
      daysActive: u.daysActive,
      totalInteractions: u.totalInteractions,
      avgInteractionsPerDay:
        u.daysActive > 0
          ? Math.round((u.totalInteractions / u.daysActive) * 100) / 100
          : 0,
      acceptanceRate:
        u.totalCodeGen > 0
          ? Math.round((u.totalCodeAccept / u.totalCodeGen) * 10000) / 100
          : 0,
      usedAgent: u.usedAgent,
      usedChat: u.usedChat,
      usedCli: u.usedCli,
      lastActiveDate: u.lastActiveDate,
      locAdded: u.locAdded,
      locDeleted: u.locDeleted,
    }));

    return NextResponse.json({
      period: { start: startDate, end: endDate },
      total: result.length,
      limit,
      offset,
      users: result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Users API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
