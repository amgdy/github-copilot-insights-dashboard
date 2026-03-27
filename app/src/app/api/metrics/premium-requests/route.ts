import { NextRequest, NextResponse } from "next/server";
import { getGitHubConfig } from "@/lib/db/settings";
import { resolveDisplayNames, formatUserLabel } from "@/lib/github/resolve-display-names";

export const dynamic = "force-dynamic";

const GITHUB_API_BASE = "https://api.github.com";
const API_VERSION = "2026-03-10";

/** Per-user/month included premium request quotas by plan. */
const PLAN_QUOTAS: Record<string, number> = {
  business: 300,
  enterprise: 1000,
};

interface BillingUsageItem {
  date: string;
  organizationName?: string;
  repositoryName?: string;
  user?: string;
  team?: string;
  sku?: string;
  unitType?: string;
  grossQuantity?: number;
  grossAmount?: number;
  discountAmount?: number;
  netQuantity?: number;
  netAmount?: number;
}

interface BillingUsageResponse {
  usageItems: BillingUsageItem[];
}

interface SeatInfo {
  plan_type: string;
  assignee: { login: string };
}

interface SeatsResponse {
  total_seats: number;
  seats: SeatInfo[];
}

export async function GET(request: NextRequest) {
  try {
    const { token, enterpriseSlug } = await getGitHubConfig();

    if (!token || !enterpriseSlug) {
      return NextResponse.json(
        { error: "GitHub token and enterprise slug must be configured in Settings." },
        { status: 400 }
      );
    }

    const params = request.nextUrl.searchParams;
    const now = new Date();
    const year = parseInt(params.get("year") ?? String(now.getFullYear()), 10);
    const month = parseInt(params.get("month") ?? String(now.getMonth() + 1), 10);

    // 1. Fetch premium request usage from enterprise billing API
    const usageUrl = `${GITHUB_API_BASE}/enterprises/${encodeURIComponent(enterpriseSlug)}/settings/billing/premium_request/usage?year=${year}&month=${month}`;
    const usageRes = await fetch(usageUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": API_VERSION,
      },
      next: { revalidate: 0 },
    });

    if (!usageRes.ok) {
      const text = await usageRes.text();
      console.error(`Premium billing API error: ${usageRes.status}`, text);
      return NextResponse.json(
        { error: `GitHub Premium Billing API error: ${usageRes.status} ${usageRes.statusText}` },
        { status: usageRes.status }
      );
    }

    const billingData: BillingUsageResponse = await usageRes.json();
    const usageItems = billingData.usageItems ?? [];

    // 2. Fetch seat data for plan quotas (deduplicated by user — highest plan wins)
    const allSeats: SeatInfo[] = [];
    let page = 1;
    while (true) {
      const seatsUrl = `${GITHUB_API_BASE}/enterprises/${encodeURIComponent(enterpriseSlug)}/copilot/billing/seats?per_page=100&page=${page}`;
      const seatsRes = await fetch(seatsUrl, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": API_VERSION,
        },
        next: { revalidate: 0 },
      });

      if (!seatsRes.ok) break;

      const seatsData: SeatsResponse = await seatsRes.json();
      allSeats.push(...seatsData.seats);
      if (seatsData.seats.length < 100) break;
      page++;
    }

    // Deduplicate by user login — highest plan wins (enterprise > business)
    const PLAN_TIER: Record<string, number> = { enterprise: 2, business: 1 };
    const userPlanMap = new Map<string, string>();
    for (const seat of allSeats) {
      const login = seat.assignee.login;
      const plan = seat.plan_type || "unknown";
      const currentPlan = userPlanMap.get(login);
      if (!currentPlan || (PLAN_TIER[plan] ?? 0) > (PLAN_TIER[currentPlan] ?? 0)) {
        userPlanMap.set(login, plan);
      }
    }

    const totalSeats = userPlanMap.size;
    const planCounts: Record<string, number> = {};
    for (const [, plan] of userPlanMap) {
      planCounts[plan] = (planCounts[plan] || 0) + 1;
    }

    // 3. Calculate included capacity
    let totalIncludedQuota = 0;
    for (const [plan, count] of Object.entries(planCounts)) {
      totalIncludedQuota += (PLAN_QUOTAS[plan] ?? 0) * count;
    }

    // 4. Aggregate billing data
    let totalGrossQuantity = 0;
    let totalNetAmount = 0;
    let totalGrossAmount = 0;

    const perModelMap = new Map<string, { sku: string; grossQuantity: number; grossAmount: number; netAmount: number }>();
    const perUserMap = new Map<string, { user: string; grossQuantity: number; grossAmount: number; netAmount: number }>();
    const perOrgMap = new Map<string, { org: string; grossQuantity: number; grossAmount: number; netAmount: number }>();

    for (const item of usageItems) {
      const qty = item.grossQuantity ?? 0;
      const gross = item.grossAmount ?? 0;
      const net = item.netAmount ?? 0;

      totalGrossQuantity += qty;
      totalGrossAmount += gross;
      totalNetAmount += net;

      // Per-model (sku)
      if (item.sku) {
        const existing = perModelMap.get(item.sku) ?? { sku: item.sku, grossQuantity: 0, grossAmount: 0, netAmount: 0 };
        existing.grossQuantity += qty;
        existing.grossAmount += gross;
        existing.netAmount += net;
        perModelMap.set(item.sku, existing);
      }

      // Per-user
      if (item.user) {
        const existing = perUserMap.get(item.user) ?? { user: item.user, grossQuantity: 0, grossAmount: 0, netAmount: 0 };
        existing.grossQuantity += qty;
        existing.grossAmount += gross;
        existing.netAmount += net;
        perUserMap.set(item.user, existing);
      }

      // Per-org
      if (item.organizationName) {
        const existing = perOrgMap.get(item.organizationName) ?? { org: item.organizationName, grossQuantity: 0, grossAmount: 0, netAmount: 0 };
        existing.grossQuantity += qty;
        existing.grossAmount += gross;
        existing.netAmount += net;
        perOrgMap.set(item.organizationName, existing);
      }
    }

    // 5. Calculate included vs overage
    const includedUsed = Math.min(totalGrossQuantity, totalIncludedQuota);
    const overage = Math.max(0, totalGrossQuantity - totalIncludedQuota);

    // 6. Resolve display names for users
    const userLogins = Array.from(perUserMap.keys());
    const displayNameMap = await resolveDisplayNames(userLogins, token);

    const perModelBreakdown = Array.from(perModelMap.values())
      .sort((a, b) => b.grossQuantity - a.grossQuantity);
    const perUserBreakdown = Array.from(perUserMap.values())
      .map((u) => ({
        ...u,
        displayLabel: formatUserLabel(u.user, displayNameMap),
      }))
      .sort((a, b) => b.grossQuantity - a.grossQuantity);
    const perOrgBreakdown = Array.from(perOrgMap.values())
      .sort((a, b) => b.grossQuantity - a.grossQuantity);

    return NextResponse.json({
      period: { year, month },
      totals: {
        totalPremiumRequests: totalGrossQuantity,
        includedQuota: totalIncludedQuota,
        includedUsed,
        overage,
        grossAmount: Math.round(totalGrossAmount * 100) / 100,
        netAmount: Math.round(totalNetAmount * 100) / 100,
      },
      seats: {
        total: totalSeats,
        planCounts,
      },
      perModelBreakdown,
      perUserBreakdown,
      perOrgBreakdown,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Premium requests API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
