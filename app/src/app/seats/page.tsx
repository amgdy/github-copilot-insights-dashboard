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
}

interface Assignment {
  login: string;
  displayName: string | null;
  planType: string;
  assignmentMethod: string;
  assigningTeam: string | null;
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

const tooltipStyle = {
  backgroundColor: "#fff",
  titleColor: "#111827",
  bodyColor: "#374151",
  borderColor: "#e5e7eb",
  borderWidth: 1,
  cornerRadius: 8,
  padding: 10,
  boxPadding: 4,
  titleFont: { weight: "bold" as const, size: 12 },
  bodyFont: { size: 11 },
};

const doughnutOpts = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: "60%",
  plugins: {
    legend: {
      position: "right" as const,
      labels: { usePointStyle: true, pointStyle: "circle" as const, font: { size: 11 }, padding: 12 },
    },
    tooltip: tooltipStyle,
  },
};

const barOpts = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: tooltipStyle,
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 }, color: "#9ca3af" } },
    y: { grid: { color: "#f0f0f0" }, ticks: { font: { size: 11 }, color: "#9ca3af" } },
  },
};

/* ── Component ── */

export default function BusinessValuePage() {
  const [data, setData] = useState<BusinessValueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Prepare DataTable-compatible data with display labels
  const inactiveUsersData = useMemo(() => {
    if (!data) return [];
    return data.inactiveUsers.map((u) => ({
      ...u,
      displayLabel: u.displayName ? `${u.displayName} (${u.login})` : u.login,
    }));
  }, [data]);

  const allUsersData = useMemo(() => {
    if (!data) return [];
    return data.allUsers.map((u) => ({
      ...u,
      displayLabel: u.displayName ? `${u.displayName} (${u.login})` : u.login,
    }));
  }, [data]);

  const allAssignmentsData = useMemo(() => {
    if (!data) return [];
    return data.allAssignments.map((a) => ({
      ...a,
      displayLabel: a.displayName ? `${a.displayName} (${a.login})` : a.login,
    }));
  }, [data]);

  /* ── Render ── */

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-400">
        Loading billing data from GitHub...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-semibold text-red-800">Unable to load billing data</h2>
          <p className="mt-2 text-sm text-red-600">{error}</p>
          <p className="mt-3 text-xs text-red-500">
            Ensure your PAT has <code className="rounded-sm bg-red-100 px-1">manage_billing:copilot</code> or{" "}
            <code className="rounded-sm bg-red-100 px-1">read:enterprise</code> scope.
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">GitHub Copilot Licensing</h1>
        <p className="text-sm text-gray-500">
          License utilization, seat costs, and savings opportunities — live from GitHub API
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Total Seats" value={data.totalSeats} />
        <Kpi label="Active Users" value={data.activeCount} color="text-green-600" />
        <Kpi label="Inactive Users" value={data.inactiveCount} color="text-amber-600" />
        <Kpi label="Monthly Cost" value={fmt$(data.totalMonthlyCost)} />
        <Kpi label="Cost / Active User" value={fmt$(data.costPerActiveUser)} />
        <Kpi label="Utilization" value={`${data.utilizationRate}%`} color={data.utilizationRate >= 70 ? "text-green-600" : "text-amber-600"} />
      </div>

      {/* Savings Banner */}
      {data.potentialMonthlySavings > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-amber-900">Potential Savings Opportunity</h3>
              <p className="text-sm text-amber-700">
                {data.inactiveCount} users have not used Copilot in the last {data.inactiveThresholdDays} days.
                Removing their seats could save:
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-amber-900">{fmt$(data.potentialMonthlySavings)}/mo</p>
              <p className="text-sm text-amber-700">{fmt$(data.potentialAnnualSavings)}/year</p>
            </div>
          </div>
        </div>
      )}

      {/* Charts Row 1: Utilization + Plan Distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Seat utilization" subtitle={`Active within ${data.inactiveThresholdDays} days`}>
          {utilizationDonut && <div className="h-[280px]"><Doughnut data={utilizationDonut} options={doughnutOpts} /></div>}
        </Card>
        <Card title="Seats by plan type" subtitle="Distribution of Copilot license plans">
          {planDonut && <div className="h-[280px]"><Doughnut data={planDonut} options={doughnutOpts} /></div>}
        </Card>
      </div>

      {/* Charts Row 2: Cost Breakdown + Savings */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Monthly cost by plan" subtitle="License cost breakdown by plan type">
          {costByPlanBar && <div className="h-[280px]"><Bar data={costByPlanBar} options={barOpts} /></div>}
        </Card>
        <Card title="Cost vs potential savings" subtitle="Active seat cost vs recoverable inactive cost">
          {savingsBar && <div className="h-[280px]"><Bar data={savingsBar} options={barOpts} /></div>}
        </Card>
      </div>

      {/* Cost Summary Table */}
      <Card title="Cost summary" subtitle="Monthly and annual cost breakdown">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="pb-2 pr-4">Item</th>
                <th className="pb-2 pr-4 text-right">Monthly</th>
                <th className="pb-2 text-right">Annual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="py-2 pr-4 font-medium text-gray-900">Total License Cost</td>
                <td className="py-2 pr-4 text-right text-gray-700">{fmt$(data.totalMonthlyCost)}</td>
                <td className="py-2 text-right text-gray-700">{fmt$(data.totalAnnualCost)}</td>
              </tr>
              {Object.entries(data.costByPlan).map(([plan, info]) => (
                <tr key={plan}>
                  <td className="py-2 pl-4 pr-4 text-gray-600">
                    {plan.charAt(0).toUpperCase() + plan.slice(1)} ({info.count} seats)
                  </td>
                  <td className="py-2 pr-4 text-right text-gray-600">{fmt$(info.monthlyCost)}</td>
                  <td className="py-2 text-right text-gray-600">{fmt$(info.monthlyCost * 12)}</td>
                </tr>
              ))}
              <tr className="font-medium text-green-700">
                <td className="py-2 pr-4">Active Seat Cost</td>
                <td className="py-2 pr-4 text-right">{fmt$(data.activeCost)}</td>
                <td className="py-2 text-right">{fmt$(data.activeCost * 12)}</td>
              </tr>
              <tr className="font-medium text-amber-700">
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
              { key: "displayLabel", header: "User", render: (value: unknown) => <span className="font-medium text-gray-900">{String(value)}</span> },
              { key: "planType", header: "Plan", render: (value: unknown) => (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${String(value) === "enterprise" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{String(value)}</span>
              ) },
              { key: "assignmentCount", header: "Assignments", align: "right", render: (value: unknown) => (
                <span className="text-xs text-gray-600">{String(value)}</span>
              ) },
              { key: "daysInactive", header: "Days Inactive", align: "right", render: (value: unknown) => {
                const v = value as number | null;
                if (v === null) return <span className="text-red-600 font-medium">Never</span>;
                return <span className={v > 60 ? "font-medium text-red-600" : "text-amber-600"}>{v}</span>;
              } },
              { key: "lastActivityAt", header: "Last Activity", render: (value: unknown) => {
                const v = value as string | null;
                return v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
              } },
              { key: "editor", header: "Last Editor", render: (value: unknown) => <span className="text-xs text-gray-500">{String(value ?? "—")}</span> },
              { key: "monthlyCost", header: "Monthly Cost", align: "right", render: (value: unknown) => <span className="font-medium text-gray-900">{fmt$(Number(value))}</span> },
            ]}
            data={inactiveUsersData as unknown as Record<string, unknown>[]}
            emptyMessage="No inactive users"
            searchPlaceholder="Search inactive users..."
            pageSize={25}
          />
        </Card>
      )}

      {/* Licensed Users Table (deduplicated — one row per user, effective license) */}
      <Card title={`Licensed users (${data.allUsers.length})`} subtitle="Unique users with effective license tier (highest plan per user)">
        <DataTable
          columns={[
            { key: "displayLabel", header: "User", render: (value: unknown) => <span className="font-medium text-gray-900">{String(value)}</span> },
            { key: "effectivePlan", header: "Effective License", render: (value: unknown) => {
              const v = String(value);
              return (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${v === "enterprise" ? "bg-purple-100 text-purple-700" : v === "business" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </span>
              );
            } },
            { key: "status", header: "Status", render: (value: unknown) => {
              const v = String(value);
              return (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${v === "active" ? "bg-green-100 text-green-700" : v === "inactive" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                  {v === "never_active" ? "Never Active" : v.charAt(0).toUpperCase() + v.slice(1)}
                </span>
              );
            } },
            { key: "assignmentCount", header: "Assignments", align: "right", render: (value: unknown) => <span className="text-gray-700">{String(value)}</span> },
            { key: "lastActivityAt", header: "Last Activity", render: (value: unknown) => {
              const v = value as string | null;
              return <span className="text-xs text-gray-600">{v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</span>;
            } },
            { key: "monthlyCost", header: "Monthly Cost", align: "right", render: (value: unknown) => <span className="font-medium text-gray-900">{fmt$(Number(value))}</span> },
          ]}
          data={allUsersData as unknown as Record<string, unknown>[]}
          emptyMessage="No licensed users found"
          searchPlaceholder="Search by name or login..."
          pageSize={25}
        />
      </Card>

      {/* License Assignments Table (raw — all seat records including duplicates) */}
      <Card title={`License assignments (${data.allAssignments.length})`} subtitle="All seat assignments from GitHub (a user may appear multiple times)">
        <DataTable
          columns={[
            { key: "displayLabel", header: "User", render: (value: unknown) => <span className="font-medium text-gray-900">{String(value)}</span> },
            { key: "planType", header: "Plan Type", render: (value: unknown) => {
              const v = String(value);
              return (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${v === "enterprise" ? "bg-purple-100 text-purple-700" : v === "business" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </span>
              );
            } },
            { key: "assignmentMethod", header: "Assigned Via", render: (value: unknown) => (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${String(value) === "team" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                {String(value) === "team" ? "Team" : "Direct"}
              </span>
            ) },
            { key: "assigningTeam", header: "Team", render: (value: unknown) => <span className="text-xs text-gray-600">{String(value ?? "—")}</span> },
            { key: "createdAt", header: "Assigned Date", render: (value: unknown) => (
              <span className="text-xs text-gray-600">{new Date(String(value)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            ) },
          ]}
          data={allAssignmentsData as unknown as Record<string, unknown>[]}
          emptyMessage="No assignments found"
          searchPlaceholder="Search assignments..."
          pageSize={25}
        />
      </Card>
    </div>
  );
}

/* ── Sub-components ── */

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-xs">
      <div className="border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-xs">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color ?? "text-gray-900"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
