import { NextResponse } from "next/server";
import { getGitHubConfig } from "@/lib/db/settings";
import { resolveDisplayNames } from "@/lib/github/resolve-display-names";

const GITHUB_API_BASE = "https://api.github.com";
const API_VERSION = "2026-03-10";

interface SeatAssignee {
  login: string;
  avatar_url?: string;
  id?: number;
}

interface AssigningTeam {
  id: number;
  name: string;
  slug: string;
}

interface CopilotSeat {
  created_at: string;
  updated_at: string;
  pending_cancellation_date: string | null;
  last_activity_at: string | null;
  last_activity_editor: string | null;
  plan_type: string;
  assignee: SeatAssignee;
  assigning_team: AssigningTeam | null;
}

interface SeatsResponse {
  total_seats: number;
  seats: CopilotSeat[];
}

const PRICING: Record<string, number> = {
  business: 19,
  enterprise: 39,
};

const INACTIVE_THRESHOLD_DAYS = 30;

export async function GET() {
  try {
    const { token, enterpriseSlug } = await getGitHubConfig();

    if (!token || !enterpriseSlug) {
      return NextResponse.json(
        { error: "GitHub token and enterprise slug must be configured in Settings." },
        { status: 400 }
      );
    }

    const allSeats: CopilotSeat[] = [];
    let page = 1;
    let totalSeats = 0;

    // Paginate through all seats
    while (true) {
      const url = `${GITHUB_API_BASE}/enterprises/${encodeURIComponent(enterpriseSlug)}/copilot/billing/seats?per_page=100&page=${page}`;
      const response = await fetch(url, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": API_VERSION,
        },
        next: { revalidate: 0 },
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`GitHub API error: ${response.status} ${response.statusText}`, text);
        return NextResponse.json(
          { error: `GitHub API error: ${response.status} ${response.statusText}` },
          { status: response.status }
        );
      }

      const data: SeatsResponse = await response.json();
      totalSeats = data.total_seats;
      allSeats.push(...data.seats);

      if (allSeats.length >= totalSeats || data.seats.length < 100) {
        break;
      }
      page++;
    }

    // Fetch user display names concurrently (best-effort)
    const uniqueLogins = [...new Set(allSeats.map((s) => s.assignee?.login).filter(Boolean))];
    const displayNameMap = await resolveDisplayNames(uniqueLogins, token);

    // Deduplicate seats by user login — highest plan wins (enterprise > business)
    const PLAN_TIER: Record<string, number> = { enterprise: 2, business: 1 };
    const userSeatsMap = new Map<string, CopilotSeat[]>();
    for (const seat of allSeats) {
      const login = seat.assignee?.login ?? "unknown";
      if (!userSeatsMap.has(login)) {
        userSeatsMap.set(login, []);
      }
      userSeatsMap.get(login)!.push(seat);
    }

    const now = new Date();
    const thresholdDate = new Date(now.getTime() - INACTIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

    let activeCount = 0;
    let inactiveCount = 0;
    let neverActiveCount = 0;
    let pendingCancellation = 0;
    const planCounts: Record<string, number> = {};
    const inactiveUsers: Array<{
      login: string;
      displayName: string | null;
      lastActivityAt: string | null;
      daysInactive: number | null;
      planType: string;
      monthlyCost: number;
      editor: string | null;
      assignmentCount: number;
    }> = [];

    const allUsers: Array<{
      login: string;
      displayName: string | null;
      effectivePlan: string;
      assignmentCount: number;
      lastActivityAt: string | null;
      lastEditor: string | null;
      earliestAssignment: string;
      status: string;
      monthlyCost: number;
    }> = [];

    for (const [login, seats] of userSeatsMap) {
      const displayName = displayNameMap.get(login) ?? null;

      // Determine effective (highest-tier) plan across all assignments
      let effectivePlan = "unknown";
      let effectiveTier = -1;
      let latestActivity: string | null = null;
      let latestEditor: string | null = null;
      let earliestCreated: string = seats[0].created_at;
      let hasPending = false;

      for (const seat of seats) {
        const plan = seat.plan_type || "unknown";
        const tier = PLAN_TIER[plan] ?? 0;
        if (tier > effectiveTier) {
          effectiveTier = tier;
          effectivePlan = plan;
        }
        if (seat.last_activity_at) {
          if (!latestActivity || new Date(seat.last_activity_at) > new Date(latestActivity)) {
            latestActivity = seat.last_activity_at;
            latestEditor = seat.last_activity_editor ?? null;
          }
        }
        if (new Date(seat.created_at) < new Date(earliestCreated)) {
          earliestCreated = seat.created_at;
        }
        if (seat.pending_cancellation_date) {
          hasPending = true;
        }
      }

      planCounts[effectivePlan] = (planCounts[effectivePlan] || 0) + 1;
      if (hasPending) pendingCancellation++;

      const price = PRICING[effectivePlan] ?? 0;

      // Determine activity status using latest activity across all assignments
      let status: string;
      if (!latestActivity) {
        neverActiveCount++;
        status = "never_active";
        inactiveUsers.push({
          login,
          displayName,
          lastActivityAt: null,
          daysInactive: null,
          planType: effectivePlan,
          monthlyCost: price,
          editor: null,
          assignmentCount: seats.length,
        });
      } else {
        const lastActivityDate = new Date(latestActivity);
        const daysInactive = Math.floor((now.getTime() - lastActivityDate.getTime()) / (24 * 60 * 60 * 1000));

        if (lastActivityDate >= thresholdDate) {
          activeCount++;
          status = "active";
        } else {
          inactiveCount++;
          status = "inactive";
          inactiveUsers.push({
            login,
            displayName,
            lastActivityAt: latestActivity,
            daysInactive,
            planType: effectivePlan,
            monthlyCost: price,
            editor: latestEditor,
            assignmentCount: seats.length,
          });
        }
      }

      allUsers.push({
        login,
        displayName,
        effectivePlan,
        assignmentCount: seats.length,
        lastActivityAt: latestActivity,
        lastEditor: latestEditor,
        earliestAssignment: earliestCreated,
        status,
        monthlyCost: price,
      });
    }

    // Build raw assignments list (all seat records, including duplicates per user)
    const allAssignments = allSeats.map((seat) => {
      const login = seat.assignee?.login ?? "unknown";
      return {
        login,
        displayName: displayNameMap.get(login) ?? null,
        planType: seat.plan_type || "unknown",
        assignmentMethod: seat.assigning_team ? "team" : "direct",
        assigningTeam: seat.assigning_team?.name ?? null,
        createdAt: seat.created_at,
      };
    });

    // Cost calculations (based on unique users / effective plans)
    const uniqueUserCount = userSeatsMap.size;
    let totalMonthlyCost = 0;
    let activeCost = 0;
    const costByPlan: Record<string, { count: number; monthlyCost: number }> = {};

    for (const user of allUsers) {
      totalMonthlyCost += user.monthlyCost;
      if (!costByPlan[user.effectivePlan]) {
        costByPlan[user.effectivePlan] = { count: 0, monthlyCost: 0 };
      }
      costByPlan[user.effectivePlan].count++;
      costByPlan[user.effectivePlan].monthlyCost += user.monthlyCost;

      if (user.status === "active") {
        activeCost += user.monthlyCost;
      }
    }

    const potentialSavings = inactiveUsers.reduce((sum, u) => sum + u.monthlyCost, 0);
    const costPerActiveUser = activeCount > 0 ? totalMonthlyCost / activeCount : 0;
    const utilizationRate = uniqueUserCount > 0 ? (activeCount / uniqueUserCount) * 100 : 0;

    // Sort inactive users: never-active first, then by most days inactive
    inactiveUsers.sort((a, b) => {
      if (a.daysInactive === null && b.daysInactive === null) return 0;
      if (a.daysInactive === null) return -1;
      if (b.daysInactive === null) return 1;
      return b.daysInactive - a.daysInactive;
    });

    return NextResponse.json({
      totalSeats: uniqueUserCount,
      activeCount,
      inactiveCount: inactiveCount + neverActiveCount,
      neverActiveCount,
      pendingCancellation,
      utilizationRate: Math.round(utilizationRate * 10) / 10,
      totalMonthlyCost,
      totalAnnualCost: totalMonthlyCost * 12,
      activeCost,
      potentialMonthlySavings: potentialSavings,
      potentialAnnualSavings: potentialSavings * 12,
      costPerActiveUser: Math.round(costPerActiveUser * 100) / 100,
      costByPlan,
      planCounts,
      inactiveUsers,
      allUsers: allUsers.sort((a, b) => a.login.localeCompare(b.login)),
      allAssignments: allAssignments.sort((a, b) => a.login.localeCompare(b.login)),
      inactiveThresholdDays: INACTIVE_THRESHOLD_DAYS,
    });
  } catch (error) {
    console.error("Business value API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Copilot billing data" },
      { status: 500 }
    );
  }
}
