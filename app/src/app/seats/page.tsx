"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import { DataTable } from "@/components/ui/data-table";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { usePdfExport } from "@/components/ui/pdf-export";
import { useChartOptions } from "@/lib/theme/chart-theme";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { ConfigurationBanner } from "@/components/layout/configuration-banner";
import { AlertTriangle, Settings } from "lucide-react";
import Link from "next/link";

ChartJS.register(
  CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend
);

/* ── Types ── */

interface InactiveUser {
  login: string;
  displayName: string | null;
  lastActivityAt: string | null;
  daysInactive: number | null;
  planType: string;
  monthlyCost: number;
  editor: string | null;
  assignmentCount: number;
}

interface AllUser {
  login: string;
  displayName: string | null;
  effectivePlan: string;
  assignmentCount: number;
  lastActivityAt: string | null;
  lastEditor: string | null;
  earliestAssignment: string;
  status: string;
  monthlyCost: number;
  organizations: string[];
  assignedVia: string;
}

interface Assignment {
  login: string;
  displayName: string | null;
  planType: string;
  assignmentMethod: string;
  assigningTeam: string | null;
  organization: string | null;
  createdAt: string;
}

interface BusinessValueData {
  totalSeats: number;
  activeCount: number;
  inactiveCount: number;
  neverActiveCount: number;
  pendingCancellation: number;
  utilizationRate: number;
  totalMonthlyCost: number;
  totalAnnualCost: number;
  activeCost: number;
  potentialMonthlySavings: number;
  potentialAnnualSavings: number;
  costPerActiveUser: number;
  costByPlan: Record<string, { count: number; monthlyCost: number }>;
  planCounts: Record<string, number>;
  inactiveUsers: InactiveUser[];
  allUsers: AllUser[];
  allAssignments: Assignment[];
  inactiveThresholdDays: number;
}

/* ── Helpers ── */

const PLAN_COLORS: Record<string, string> = {
  business: "#3b82f6",
  enterprise: "#8b5cf6",
  unknown: "#9ca3af",
};

function fmt$(v: number) {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/* ── Chart Options ── */

// tooltipStyle moved to component via useChartOptions

// doughnutOpts moved to component via useChartOptions

// barOpts moved to component via useChartOptions

/* ── Component ── */

export default function BusinessValuePage() {
  const { commonOptions: barOpts, doughnutOptions: doughnutOpts } = useChartOptions();
  const { t } = useTranslation();
  const [data, setData] = useState<BusinessValueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const { ref: reportRef, ExportButton: PdfButton } = usePdfExport("copilot-licensing");

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch("/api/metrics/seats")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((seatsData) => {
        setData(seatsData);
      })
      .catch((err) => {
        console.error("Failed to fetch licensing data:", err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  /* ── Chart data ── */

  const utilizationDonut = useMemo(() => {
    if (!data) return null;
    return {
      labels: ["Active", "Inactive", "Never Active"],
      datasets: [{
        data: [
          data.activeCount,
          data.inactiveCount - data.neverActiveCount,
          data.neverActiveCount,
        ],
        backgroundColor: ["#22c55e", "#f59e0b", "#ef4444"],
        borderWidth: 0,
      }],
    };
  }, [data]);

  const planDonut = useMemo(() => {
    if (!data) return null;
    const plans = Object.entries(data.planCounts);
    return {
      labels: plans.map(([p]) => p.charAt(0).toUpperCase() + p.slice(1)),
      datasets: [{
        data: plans.map(([, v]) => v),
        backgroundColor: plans.map(([p]) => PLAN_COLORS[p] ?? "#9ca3af"),
        borderWidth: 0,
      }],
    };
  }, [data]);

  const costByPlanBar = useMemo(() => {
    if (!data) return null;
    const plans = Object.entries(data.costByPlan);
    return {
      labels: plans.map(([p]) => p.charAt(0).toUpperCase() + p.slice(1)),
      datasets: [{
        label: "Monthly Cost ($)",
        data: plans.map(([, v]) => v.monthlyCost),
        backgroundColor: plans.map(([p]) => PLAN_COLORS[p] ?? "#9ca3af"),
        borderRadius: 6,
      }],
    };
  }, [data]);

  const savingsBar = useMemo(() => {
    if (!data) return null;
    return {
      labels: ["Active Seats Cost", "Potential Savings"],
      datasets: [{
        data: [data.activeCost, data.potentialMonthlySavings],
        backgroundColor: ["#22c55e", "#ef4444"],
        borderRadius: 6,
      }],
    };
  }, [data]);

  // Collect unique orgs for the org filter dropdown
  const availableOrgs = useMemo(() => {
    if (!data) return [];
    const orgs = new Set<string>();
    for (const u of data.allUsers) {
      for (const o of u.organizations) orgs.add(o);
    }
    for (const a of data.allAssignments) {
      if (a.organization) orgs.add(a.organization);
    }
    return [...orgs].sort();
  }, [data]);

  // Prepare DataTable-compatible data with display labels + org filtering
  const inactiveUsersData = useMemo(() => {
    if (!data) return [];
    return data.inactiveUsers.map((u) => ({
      ...u,
      displayLabel: u.displayName ? `${u.displayName} (${u.login})` : u.login,
    }));
  }, [data]);

  const allUsersData = useMemo(() => {
    if (!data) return [];
    let users = data.allUsers;
    if (orgFilter !== "all") {
      users = users.filter((u) =>
        orgFilter === "enterprise"
          ? u.organizations.length === 0
          : u.organizations.includes(orgFilter)
      );
    }
    return users.map((u) => ({
      ...u,
      displayLabel: u.displayName ? `${u.displayName} (${u.login})` : u.login,
      orgList: u.organizations.length > 0 ? u.organizations.join(", ") : "Enterprise",
    }));
  }, [data, orgFilter]);

  const allAssignmentsData = useMemo(() => {
    if (!data) return [];
    let assignments = data.allAssignments;
    if (orgFilter !== "all") {
      assignments = assignments.filter((a) =>
        orgFilter === "enterprise"
          ? !a.organization
          : a.organization === orgFilter
      );
    }
    return assignments.map((a) => ({
      ...a,
      displayLabel: a.displayName ? `${a.displayName} (${a.login})` : a.login,
    }));
  }, [data, orgFilter]);

  /* ── Render ── */

  if (loading) {
    return <LoadingSpinner message={t("seats.loadingSeats")} />;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <ConfigurationBanner />
        <div className="flex flex-col items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-6 py-16 text-center dark:border-amber-800 dark:bg-amber-950/40">
          <div className="mb-4 rounded-full bg-amber-100 p-4 dark:bg-amber-900/50">
            <AlertTriangle className="h-8 w-8 text-amber-500 dark:text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t("common.apiError")}
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-sm text-gray-600 dark:text-gray-400">
            {error}
          </p>
          <Link
            href="/settings"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition-colors hover:bg-blue-700"
          >
            <Settings className="h-4 w-4" />
            {t("configBanner.goToSettings")}
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div ref={reportRef} className="space-y-6">
      <ConfigurationBanner />
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t("seats.title")}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("seats.subtitle")}
          </p>
        </div>
        <PdfButton />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label={t("seats.totalSeats")} value={data.totalSeats} />
        <Kpi label={t("seats.activeUsers")} value={data.activeCount} color="text-green-600" />
        <Kpi label={t("seats.inactiveUsers")} value={data.inactiveCount} color="text-amber-600 dark:text-amber-400" />
        <Kpi label={t("seats.monthlyCost")} value={fmt$(data.totalMonthlyCost)} />
        <Kpi label={t("seats.costPerActiveUser")} value={fmt$(data.costPerActiveUser)} />
        <Kpi label={t("seats.utilization")} value={`${data.utilizationRate}%`} color={data.utilizationRate >= 70 ? "text-green-600" : "text-amber-600 dark:text-amber-400"} />
      </div>

      {/* Org Filter */}
      {availableOrgs.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Filter by assignment:</label>
          <select
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-xs focus:border-blue-500 focus:outline-hidden dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="all">All assignments</option>
            <option value="enterprise">Enterprise-level only</option>
            {availableOrgs.map((org) => (
              <option key={org} value={org}>{org}</option>
            ))}
          </select>
        </div>
      )}

      {/* Savings Banner */}
      {data.potentialMonthlySavings > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/30">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-amber-900 dark:text-amber-200">Potential Savings Opportunity</h3>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {data.inactiveCount} users have not used Copilot in the last {data.inactiveThresholdDays} days.
                Removing their seats could save:
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-amber-900 dark:text-amber-200">{fmt$(data.potentialMonthlySavings)}/mo</p>
              <p className="text-sm text-amber-700 dark:text-amber-300">{fmt$(data.potentialAnnualSavings)}/year</p>
            </div>
          </div>
        </div>
      )}

      {/* Charts Row 1: Utilization + Plan Distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={t("seats.seatUtilization")} subtitle={`Active within ${data.inactiveThresholdDays} days`}>
          {utilizationDonut && <div className="h-[280px]"><Doughnut data={utilizationDonut} options={doughnutOpts} /></div>}
        </Card>
        <Card title={t("seats.seatsByPlanType")} subtitle={t("seats.seatsByPlanTypeDesc")}>
          {planDonut && <div className="h-[280px]"><Doughnut data={planDonut} options={doughnutOpts} /></div>}
        </Card>
      </div>

      {/* Charts Row 2: Cost Breakdown + Savings */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={t("seats.monthlyCostByPlan")} subtitle={t("seats.monthlyCostByPlanDesc")}>
          {costByPlanBar && <div className="h-[280px]"><Bar data={costByPlanBar} options={barOpts} /></div>}
        </Card>
        <Card title={t("seats.costVsSavings")} subtitle={t("seats.costVsSavingsDesc")}>
          {savingsBar && <div className="h-[280px]"><Bar data={savingsBar} options={barOpts} /></div>}
        </Card>
      </div>

      {/* Cost Summary Table */}
      <Card title={t("seats.costSummary")} subtitle={t("seats.costSummaryDesc")}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <th className="pb-2 pr-4">Item</th>
                <th className="pb-2 pr-4 text-right">Monthly</th>
                <th className="pb-2 text-right">Annual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              <tr>
                <td className="py-2 pr-4 font-medium text-gray-900 dark:text-gray-100">Total License Cost</td>
                <td className="py-2 pr-4 text-right text-gray-700 dark:text-gray-300">{fmt$(data.totalMonthlyCost)}</td>
                <td className="py-2 text-right text-gray-700 dark:text-gray-300">{fmt$(data.totalAnnualCost)}</td>
              </tr>
              {Object.entries(data.costByPlan).map(([plan, info]) => (
                <tr key={plan}>
                  <td className="py-2 pl-4 pr-4 text-gray-600 dark:text-gray-400">
                    {plan.charAt(0).toUpperCase() + plan.slice(1)} ({info.count} seats)
                  </td>
                  <td className="py-2 pr-4 text-right text-gray-600 dark:text-gray-400">{fmt$(info.monthlyCost)}</td>
                  <td className="py-2 text-right text-gray-600 dark:text-gray-400">{fmt$(info.monthlyCost * 12)}</td>
                </tr>
              ))}
              <tr className="font-medium text-green-700 dark:text-green-400">
                <td className="py-2 pr-4">Active Seat Cost</td>
                <td className="py-2 pr-4 text-right">{fmt$(data.activeCost)}</td>
                <td className="py-2 text-right">{fmt$(data.activeCost * 12)}</td>
              </tr>
              <tr className="font-medium text-amber-700 dark:text-amber-400">
                <td className="py-2 pr-4">Potential Savings (Inactive Seats)</td>
                <td className="py-2 pr-4 text-right">{fmt$(data.potentialMonthlySavings)}</td>
                <td className="py-2 text-right">{fmt$(data.potentialAnnualSavings)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Inactive Users Table */}
      {data.inactiveUsers.length > 0 && (
        <Card title={`Inactive users (${data.inactiveUsers.length})`} subtitle={`No activity in the last ${data.inactiveThresholdDays} days`}>
          <DataTable
            columns={[
              { key: "displayLabel", header: "User", render: (value: unknown) => <span className="font-medium text-gray-900 dark:text-gray-100">{String(value)}</span> },
              { key: "planType", header: "Plan", render: (value: unknown) => (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${String(value) === "enterprise" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>{String(value)}</span>
              ) },
              { key: "assignmentCount", header: "Assignments", align: "right", render: (value: unknown) => (
                <span className="text-xs text-gray-600 dark:text-gray-400">{String(value)}</span>
              ) },
              { key: "daysInactive", header: "Days Inactive", align: "right", render: (value: unknown) => {
                const v = value as number | null;
                if (v === null) return <span className="text-red-600 dark:text-red-400 font-medium">Never</span>;
                return <span className={v > 60 ? "font-medium text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}>{v}</span>;
              } },
              { key: "lastActivityAt", header: "Last Activity", render: (value: unknown) => {
                const v = value as string | null;
                return v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
              } },
              { key: "editor", header: "Last Editor", render: (value: unknown) => <span className="text-xs text-gray-500 dark:text-gray-400">{String(value ?? "—")}</span> },
              { key: "monthlyCost", header: "Monthly Cost", align: "right", render: (value: unknown) => <span className="font-medium text-gray-900 dark:text-gray-100">{fmt$(Number(value))}</span> },
            ]}
            data={inactiveUsersData as unknown as Record<string, unknown>[]}
            emptyMessage={t("seats.noInactiveUsers")}
            searchPlaceholder={t("seats.searchInactiveUsers")}
            pageSize={25}
            defaultSortKey="daysInactive"
            defaultSortDir="desc"
          />
        </Card>
      )}

      {/* Licensed Users Table (deduplicated — one row per user, effective license) */}
      <Card title={`Licensed users (${allUsersData.length})`} subtitle="Unique users with effective license tier (highest plan per user)">
        <DataTable
          columns={[
            { key: "displayLabel", header: "User", render: (value: unknown) => <span className="font-medium text-gray-900 dark:text-gray-100">{String(value)}</span> },
            { key: "effectivePlan", header: "Effective License", render: (value: unknown) => {
              const v = String(value);
              return (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${v === "enterprise" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : v === "business" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </span>
              );
            } },
            { key: "status", header: "Status", render: (value: unknown) => {
              const v = String(value);
              return (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${v === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : v === "inactive" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                  {v === "never_active" ? "Never Active" : v.charAt(0).toUpperCase() + v.slice(1)}
                </span>
              );
            } },
            { key: "orgList", header: "Organization(s)", render: (value: unknown) => {
              const v = String(value);
              return <span className={`text-xs ${v === "Enterprise" ? "font-medium text-purple-600 dark:text-purple-400" : "text-gray-600 dark:text-gray-400"}`}>{v}</span>;
            } },
            { key: "assignedVia", header: "Assigned Via", render: (value: unknown) => {
              const v = String(value);
              return (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${v === "team" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : v === "enterprise" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </span>
              );
            } },
            { key: "assignmentCount", header: "Assignments", align: "right", render: (value: unknown) => <span className="text-gray-700 dark:text-gray-300">{String(value)}</span> },
            { key: "lastActivityAt", header: "Last Activity", render: (value: unknown) => {
              const v = value as string | null;
              return <span className="text-xs text-gray-600 dark:text-gray-400">{v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</span>;
            } },
            { key: "monthlyCost", header: "Monthly Cost", align: "right", render: (value: unknown) => <span className="font-medium text-gray-900 dark:text-gray-100">{fmt$(Number(value))}</span> },
          ]}
          data={allUsersData as unknown as Record<string, unknown>[]}
          emptyMessage={t("seats.noLicensedUsers")}
          searchPlaceholder={t("seats.searchByNameOrLogin")}
          pageSize={25}
          defaultSortKey="displayLabel"
        />
      </Card>

      {/* License Assignments Table (raw — all seat records including duplicates) */}
      <Card title={`License assignments (${allAssignmentsData.length})`} subtitle="All seat assignments from GitHub (a user may appear multiple times)">
        <DataTable
          columns={[
            { key: "displayLabel", header: "User", render: (value: unknown) => <span className="font-medium text-gray-900 dark:text-gray-100">{String(value)}</span> },
            { key: "planType", header: "Plan Type", render: (value: unknown) => {
              const v = String(value);
              return (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${v === "enterprise" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : v === "business" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </span>
              );
            } },
            { key: "organization", header: "Organization", render: (value: unknown) => {
              const v = value as string | null;
              return <span className={`text-xs ${v ? "text-gray-600 dark:text-gray-400" : "font-medium text-purple-600 dark:text-purple-400"}`}>{v ?? "Enterprise"}</span>;
            } },
            { key: "assignmentMethod", header: "Assigned Via", render: (value: unknown) => (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${String(value) === "team" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>
                {String(value) === "team" ? "Team" : "Direct"}
              </span>
            ) },
            { key: "assigningTeam", header: "Team", render: (value: unknown) => <span className="text-xs text-gray-600 dark:text-gray-400">{String(value ?? "—")}</span> },
            { key: "createdAt", header: "Assigned Date", render: (value: unknown) => (
              <span className="text-xs text-gray-600 dark:text-gray-400">{new Date(String(value)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            ) },
          ]}
          data={allAssignmentsData as unknown as Record<string, unknown>[]}
          emptyMessage="No assignments found"
          searchPlaceholder="Search assignments..."
          pageSize={25}
          defaultSortKey="displayLabel"
        />
      </Card>
    </div>
  );
}

/* ── Sub-components ── */

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-xs dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color ?? "text-gray-900 dark:text-gray-100"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
