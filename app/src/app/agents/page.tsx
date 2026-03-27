"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import { DataTable } from "@/components/ui/data-table";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Filler, Tooltip, Legend
);

/* ── Types ── */

interface AgentData {
  period: { start: string; end: string };
  kpis: {
    activeUsers: number;
    agentUsers: number;
    agentAdoptionRate: number;
    agentCodeGen: number;
    agentCodeAccept: number;
    agentAcceptanceRate: number;
    totalCodeGen: number;
    agentLocAdded: number;
  };
  agentUsersOverTime: Array<{ date: string; agentUsers: number; totalUsers: number }>;
  agentModeByDay: Array<Record<string, string | number>>;
  agentModelUsage: Array<{ name: string; value: number }>;
  agentVsNonAgentCodeGen: Array<{ date: string; agentCodeGen: number; nonAgentCodeGen: number }>;
  weeklyAdoptionRate: Array<{ date: string; rate: number; agentUsers: number; totalUsers: number }>;
  topAgentUsers: Array<{
    userId: number;
    userLogin: string;
    displayLabel: string;
    daysActive: number;
    totalInteractions: number;
    codeGenerated: number;
    codeAccepted: number;
    locAdded: number;
  }>;
}

/* ── Helpers ── */

const COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
  "#06b6d4", "#d946ef", "#a855f7", "#10b981", "#e11d48",
];

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtWeek(d: string) {
  const start = new Date(d + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sm = start.toLocaleDateString("en-US", { month: "short" });
  const em = end.toLocaleDateString("en-US", { month: "short" });
  return sm === em
    ? `${sm} ${start.getDate()}–${end.getDate()}`
    : `${sm} ${start.getDate()} – ${em} ${end.getDate()}`;
}

function extractDimKeys(data: Array<Record<string, string | number>>, exclude = ["date", "name"]): string[] {
  const keys = new Set<string>();
  for (const row of data) for (const k of Object.keys(row)) if (!exclude.includes(k)) keys.add(k);
  return Array.from(keys);
}

function topN(data: Array<{ name: string; value: number | string }>, n = 10) {
  const items = data.map((d) => ({ name: d.name, value: Number(d.value) || 0 }));
  if (items.length <= n) return items;
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, n);
  const rest = sorted.slice(n).reduce((s, d) => s + d.value, 0);
  if (rest > 0) top.push({ name: "Other", value: rest });
  return top;
}

import { ReportFilters, DataSourceBanner, type FilterState } from "@/components/layout/report-filters";

/* ── Shared Chart Options ── */

const commonOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
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
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { font: { size: 11 }, color: "#9ca3af" },
    },
    y: {
      grid: { color: "#f0f0f0" },
      ticks: { font: { size: 11 }, color: "#9ca3af" },
    },
  },
};

/* ── Component ── */

export default function AgentsPage() {
  const [data, setData] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (filters: FilterState) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.set("start", filters.startDate);
      if (filters.endDate) params.set("end", filters.endDate);
      if (filters.userId) params.set("userId", filters.userId);
      const res = await fetch(`/api/metrics/agents?${params}`);
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("Failed to fetch agent data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const kpi = data?.kpis;

  /* ── Chart data (memoized) ── */

  const agentUsersChart = useMemo(() => {
    if (!data) return null;
    const ot = data.agentUsersOverTime;
    return {
      labels: ot.map((d) => fmtDate(d.date)),
      datasets: [
        {
          label: "Agent Users",
          data: ot.map((d) => Number(d.agentUsers)),
          borderColor: "#22c55e",
          backgroundColor: "rgba(34, 197, 94, 0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        },
        {
          label: "Total Active Users",
          data: ot.map((d) => Number(d.totalUsers)),
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.05)",
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          borderDash: [4, 4],
        },
      ],
    };
  }, [data]);

  const weeklyAdoptionChart = useMemo(() => {
    if (!data) return null;
    return {
      labels: data.weeklyAdoptionRate.map((d) => fmtWeek(d.date)),
      datasets: [{
        label: "Adoption Rate %",
        data: data.weeklyAdoptionRate.map((d) => Number(d.rate)),
        backgroundColor: "#8b5cf6",
        borderRadius: 4,
      }],
    };
  }, [data]);

  const agentModeChart = useMemo(() => {
    if (!data) return null;
    const keys = extractDimKeys(data.agentModeByDay);
    if (keys.length === 0) return null;
    return {
      labels: data.agentModeByDay.map((r) => fmtDate(String(r.date))),
      datasets: keys.map((k, i) => ({
        label: k,
        data: data.agentModeByDay.map((r) => Number(r[k]) || 0),
        backgroundColor: COLORS[i % COLORS.length],
        fill: true,
      })),
    };
  }, [data]);

  const agentModelDonut = useMemo(() => {
    if (!data) return null;
    const items = topN(data.agentModelUsage);
    return {
      labels: items.map((d) => d.name),
      datasets: [{
        data: items.map((d) => d.value),
        backgroundColor: items.map((_, i) => COLORS[i % COLORS.length]),
        borderWidth: 0,
      }],
    };
  }, [data]);

  const codeGenChart = useMemo(() => {
    if (!data) return null;
    return {
      labels: data.agentVsNonAgentCodeGen.map((d) => fmtDate(d.date)),
      datasets: [
        {
          label: "Agent Users",
          data: data.agentVsNonAgentCodeGen.map((d) => Number(d.agentCodeGen)),
          backgroundColor: "#22c55e",
        },
        {
          label: "Non-Agent Users",
          data: data.agentVsNonAgentCodeGen.map((d) => Number(d.nonAgentCodeGen)),
          backgroundColor: "#94a3b8",
        },
      ],
    };
  }, [data]);

  /* ── Option presets ── */

  const lineOpts = (showLegend = true) => ({
    ...commonOptions,
    plugins: { ...commonOptions.plugins, legend: { display: showLegend, position: "top" as const, labels: { usePointStyle: true, pointStyle: "circle" as const, font: { size: 11 } } } },
  });

  const barOpts = { ...commonOptions };

  const stackedBarOpts = (showLegend = true) => ({
    ...commonOptions,
    plugins: { ...commonOptions.plugins, legend: { display: showLegend, position: "top" as const, labels: { usePointStyle: true, pointStyle: "circle" as const, font: { size: 11 } } } },
    scales: {
      ...commonOptions.scales,
      x: { ...commonOptions.scales.x, stacked: true },
      y: { ...commonOptions.scales.y, stacked: true },
    },
  });

  const stackedAreaOpts = (showLegend = true) => ({
    ...commonOptions,
    plugins: { ...commonOptions.plugins, legend: { display: showLegend, position: "top" as const, labels: { usePointStyle: true, pointStyle: "circle" as const, font: { size: 11 } } } },
    scales: {
      ...commonOptions.scales,
      y: { ...commonOptions.scales.y, stacked: true },
    },
  });

  const doughnutOpts = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "55%",
    plugins: {
      legend: { position: "right" as const, labels: { usePointStyle: true, pointStyle: "circle" as const, font: { size: 11 }, padding: 12 } },
      tooltip: commonOptions.plugins.tooltip,
    },
  };

  const percentOpts = {
    ...commonOptions,
    scales: {
      ...commonOptions.scales,
      y: { ...commonOptions.scales.y, min: 0, max: 100, ticks: { ...commonOptions.scales.y.ticks, callback: (v: unknown) => `${v}%` } },
    },
  };

  return (
    <div className="space-y-6">
      {/* Header + Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">GitHub Copilot Agent Impact</h1>
          <p className="text-sm text-gray-500">
            Copilot Agent usage, adoption, and productivity impact
          </p>
        </div>
        <ReportFilters onApply={fetchData} />
      </div>
      <DataSourceBanner />

      {loading && !data ? (
        <div className="flex h-64 items-center justify-center text-sm text-gray-400">Loading...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Agent Users" value={kpi?.agentUsers ?? 0} sub={`of ${kpi?.activeUsers ?? 0} active`} />
            <Kpi label="Adoption Rate" value={`${kpi?.agentAdoptionRate ?? 0}%`} sub="Active users using agent" />
            <Kpi label="Acceptance Rate" value={`${kpi?.agentAcceptanceRate ?? 0}%`} sub="Code accepted from agent" />
            <Kpi label="LOC Added" value={kpi?.agentLocAdded ?? 0} sub="By agent users" />
          </div>

          {/* Agent Users Over Time — Area chart with dual series */}
          <Card title="Agent users over time" subtitle="Area chart — daily agent users vs total active users">
            {agentUsersChart && <div className="h-[300px]"><Line data={agentUsersChart} options={lineOpts(true)} /></div>}
          </Card>

          {/* Weekly Adoption Rate — Bar chart with % axis */}
          <Card title="Weekly agent adoption rate" subtitle="Bar chart — % of active users using agent each week">
            {weeklyAdoptionChart && <div className="h-[300px]"><Bar data={weeklyAdoptionChart} options={percentOpts} /></div>}
          </Card>

          {/* Agent Mode Requests & Model Usage */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Agent mode requests over time" subtitle="Stacked area chart — daily breakdown by feature">
              {agentModeChart ? (
                <div className="h-[300px]"><Line data={agentModeChart} options={stackedAreaOpts()} /></div>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-sm text-gray-400">No data</div>
              )}
            </Card>
            <Card title="Agent model usage" subtitle="Doughnut chart — model distribution in agent mode">
              {agentModelDonut && <div className="h-[320px]"><Doughnut data={agentModelDonut} options={doughnutOpts} /></div>}
            </Card>
          </div>

          {/* Agent vs Non-Agent Code Generation — Stacked bar */}
          <Card title="Agent vs non-agent code generation" subtitle="Stacked bar chart — daily code generation comparison">
            {codeGenChart && <div className="h-[350px]"><Bar data={codeGenChart} options={stackedBarOpts()} /></div>}
          </Card>

          {/* Top Agent Users Table */}
          <Card title="Top agent users" subtitle="Sortable table with pagination">
            <DataTable
              columns={[
                { key: "displayLabel", header: "User", render: (value: unknown) => <span className="font-medium text-gray-900">{String(value)}</span> },
                { key: "daysActive", header: "Days Active", align: "right" },
                { key: "totalInteractions", header: "Interactions", align: "right", render: (value: unknown) => Number(value).toLocaleString() },
                { key: "codeGenerated", header: "Code Generated", align: "right", render: (value: unknown) => Number(value).toLocaleString() },
                { key: "codeAccepted", header: "Code Accepted", align: "right", render: (value: unknown) => Number(value).toLocaleString() },
                { key: "locAdded", header: "LOC Added", align: "right", render: (value: unknown) => Number(value).toLocaleString() },
              ]}
              data={(data?.topAgentUsers ?? []) as unknown as Record<string, unknown>[]}
              emptyMessage="No agent users found"
              searchPlaceholder="Search users..."
              pageSize={25}
            />
          </Card>
        </>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
