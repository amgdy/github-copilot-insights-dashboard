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

interface CliData {
  period: { start: string; end: string };
  kpis: {
    activeUsers: number;
    cliUsers: number;
    cliAdoptionRate: number;
    cliCodeGen: number;
    cliCodeAccept: number;
    cliAcceptanceRate: number;
    cliLocAdded: number;
    cliLocSuggested: number;
    totalCodeGen: number;
    cliCodeGenShare: number;
    totalSessions: number;
    totalRequests: number;
    totalTokens: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
  };
  cliUsersOverTime: Array<{ date: string; cliUsers: number; totalUsers: number }>;
  dailyCliActivity: Array<{ date: string; sessions: number; requests: number }>;
  dailyTokenUsage: Array<{ date: string; promptTokens: number; completionTokens: number }>;
  cliVsNonCliCodeGen: Array<{ date: string; cliCodeGen: number; nonCliCodeGen: number }>;
  cliProductivity: Array<{ date: string; cliAvgCodeGen: number; nonCliAvgCodeGen: number }>;
  weeklyAdoptionRate: Array<{ date: string; rate: number; cliUsers: number; totalUsers: number }>;
  cliVersionDistribution: Array<{ version: string; users: number; sessions: number }>;
  topCliUsers: Array<{
    userId: number;
    userLogin: string;
    displayLabel: string;
    daysActive: number;
    totalInteractions: number;
    codeGenerated: number;
    codeAccepted: number;
    locAdded: number;
    acceptanceRate: number;
    sessions: number;
    requests: number;
    tokens: number;
  }>;
}

/* ── Helpers ── */

const COLORS = [
  "#14b8a6", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#22c55e", "#f97316", "#6366f1", "#84cc16",
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

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function topN(data: Array<{ name: string; value: number }>, n = 8) {
  if (data.length <= n) return data;
  const sorted = [...data].sort((a, b) => b.value - a.value);
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

export default function CliPage() {
  const [data, setData] = useState<CliData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (filters: FilterState) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.set("start", filters.startDate);
      if (filters.endDate) params.set("end", filters.endDate);
      if (filters.userId) params.set("userId", filters.userId);
      const res = await fetch(`/api/metrics/cli?${params}`);
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("Failed to fetch CLI data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const kpi = data?.kpis;

  /* ── Chart data (memoized) ── */

  const cliUsersChart = useMemo(() => {
    if (!data) return null;
    const ot = data.cliUsersOverTime;
    return {
      labels: ot.map((d) => fmtDate(d.date)),
      datasets: [
        {
          label: "CLI Users",
          data: ot.map((d) => Number(d.cliUsers)),
          borderColor: "#14b8a6",
          backgroundColor: "rgba(20, 184, 166, 0.1)",
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

  const cliActivityChart = useMemo(() => {
    if (!data) return null;
    const d = data.dailyCliActivity;
    if (d.length === 0) return null;
    return {
      labels: d.map((r) => fmtDate(r.date)),
      datasets: [
        {
          label: "Sessions",
          data: d.map((r) => Number(r.sessions)),
          borderColor: "#14b8a6",
          backgroundColor: "rgba(20, 184, 166, 0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        },
        {
          label: "Requests",
          data: d.map((r) => Number(r.requests)),
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245, 158, 11, 0.05)",
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          borderDash: [4, 4],
        },
      ],
    };
  }, [data]);

  const tokenUsageChart = useMemo(() => {
    if (!data) return null;
    const d = data.dailyTokenUsage;
    if (d.length === 0) return null;
    return {
      labels: d.map((r) => fmtDate(r.date)),
      datasets: [
        {
          label: "Prompt Tokens",
          data: d.map((r) => Number(r.promptTokens)),
          backgroundColor: "#8b5cf6",
        },
        {
          label: "Completion Tokens",
          data: d.map((r) => Number(r.completionTokens)),
          backgroundColor: "#14b8a6",
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

  const codeGenChart = useMemo(() => {
    if (!data) return null;
    return {
      labels: data.cliVsNonCliCodeGen.map((d) => fmtDate(d.date)),
      datasets: [
        {
          label: "CLI Users",
          data: data.cliVsNonCliCodeGen.map((d) => Number(d.cliCodeGen)),
          backgroundColor: "#14b8a6",
        },
        {
          label: "Non-CLI Users",
          data: data.cliVsNonCliCodeGen.map((d) => Number(d.nonCliCodeGen)),
          backgroundColor: "#94a3b8",
        },
      ],
    };
  }, [data]);

  const productivityChart = useMemo(() => {
    if (!data) return null;
    return {
      labels: data.cliProductivity.map((d) => fmtDate(d.date)),
      datasets: [
        {
          label: "CLI Avg Code Gen",
          data: data.cliProductivity.map((d) => Math.round(Number(d.cliAvgCodeGen) * 10) / 10),
          borderColor: "#14b8a6",
          backgroundColor: "rgba(20, 184, 166, 0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        },
        {
          label: "Non-CLI Avg Code Gen",
          data: data.cliProductivity.map((d) => Math.round(Number(d.nonCliAvgCodeGen) * 10) / 10),
          borderColor: "#94a3b8",
          backgroundColor: "rgba(148, 163, 184, 0.05)",
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          borderDash: [4, 4],
        },
      ],
    };
  }, [data]);

  const versionDonut = useMemo(() => {
    if (!data) return null;
    const items = topN(
      data.cliVersionDistribution.map((v) => ({
        name: v.version ?? "unknown",
        value: Number(v.sessions),
      }))
    );
    if (items.length === 0) return null;
    return {
      labels: items.map((d) => d.name),
      datasets: [{
        data: items.map((d) => d.value),
        backgroundColor: items.map((_, i) => COLORS[i % COLORS.length]),
        borderWidth: 0,
      }],
    };
  }, [data]);

  /* ── Option presets ── */

  const lineOpts = (showLegend = true) => ({
    ...commonOptions,
    plugins: { ...commonOptions.plugins, legend: { display: showLegend, position: "top" as const, labels: { usePointStyle: true, pointStyle: "circle" as const, font: { size: 11 } } } },
  });

  const stackedBarOpts = (showLegend = true) => ({
    ...commonOptions,
    plugins: { ...commonOptions.plugins, legend: { display: showLegend, position: "top" as const, labels: { usePointStyle: true, pointStyle: "circle" as const, font: { size: 11 } } } },
    scales: {
      ...commonOptions.scales,
      x: { ...commonOptions.scales.x, stacked: true },
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
          <h1 className="text-xl font-bold text-gray-900">GitHub CLI Impact</h1>
          <p className="text-sm text-gray-500">
            Copilot CLI adoption, session activity, token consumption, and productivity impact
          </p>
        </div>
        <ReportFilters onApply={fetchData} />
      </div>
      <DataSourceBanner />

      {loading && !data ? (
        <div className="flex h-64 items-center justify-center text-sm text-gray-400">Loading...</div>
      ) : (
        <>
          {/* KPI Cards – Row 1: Adoption */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Kpi label="CLI Users" value={kpi?.cliUsers ?? 0} sub={`of ${kpi?.activeUsers ?? 0} active`} />
            <Kpi label="Adoption Rate" value={`${kpi?.cliAdoptionRate ?? 0}%`} sub="Active users using CLI" />
            <Kpi label="Acceptance Rate" value={`${kpi?.cliAcceptanceRate ?? 0}%`} sub="Code accepted from CLI users" />
            <Kpi label="LOC Added" value={fmtNum(kpi?.cliLocAdded ?? 0)} sub="By CLI users" />
            <Kpi label="Code Gen Share" value={`${kpi?.cliCodeGenShare ?? 0}%`} sub="Of total code generation" />
          </div>

          {/* KPI Cards – Row 2: CLI Activity (from factCliDaily) */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Kpi label="CLI Sessions" value={fmtNum(kpi?.totalSessions ?? 0)} sub="Total sessions" />
            <Kpi label="CLI Requests" value={fmtNum(kpi?.totalRequests ?? 0)} sub="Total requests" />
            <Kpi label="Prompt Tokens" value={fmtNum(kpi?.totalPromptTokens ?? 0)} sub="Input token consumption" />
            <Kpi label="Completion Tokens" value={fmtNum(kpi?.totalCompletionTokens ?? 0)} sub="Output token consumption" />
          </div>

          {/* CLI Users Over Time */}
          <Card title="CLI users over time" subtitle="Area chart — daily CLI users vs total active users">
            {cliUsersChart && <div className="h-[300px]"><Line data={cliUsersChart} options={lineOpts(true)} /></div>}
          </Card>

          {/* CLI Sessions & Requests + Token Usage */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="CLI sessions & requests" subtitle="Line chart — daily session and request volume">
              {cliActivityChart ? (
                <div className="h-[300px]"><Line data={cliActivityChart} options={lineOpts(true)} /></div>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-sm text-gray-400">No CLI session data yet</div>
              )}
            </Card>
            <Card title="Token consumption" subtitle="Stacked bar — daily prompt vs completion tokens">
              {tokenUsageChart ? (
                <div className="h-[300px]"><Bar data={tokenUsageChart} options={stackedBarOpts(true)} /></div>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-sm text-gray-400">No token data yet</div>
              )}
            </Card>
          </div>

          {/* Weekly Adoption Rate + CLI Version Distribution */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Weekly CLI adoption rate" subtitle="Bar chart — % of active users using CLI each week">
              {weeklyAdoptionChart && <div className="h-[300px]"><Bar data={weeklyAdoptionChart} options={percentOpts} /></div>}
            </Card>
            <Card title="CLI version distribution" subtitle="Doughnut — sessions by CLI version">
              {versionDonut ? (
                <div className="h-[320px]"><Doughnut data={versionDonut} options={doughnutOpts} /></div>
              ) : (
                <div className="flex h-[320px] items-center justify-center text-sm text-gray-400">No version data yet</div>
              )}
            </Card>
          </div>

          {/* CLI vs Non-CLI Code Generation + Productivity */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="CLI vs non-CLI code generation" subtitle="Stacked bar — daily code generation comparison">
              {codeGenChart && <div className="h-[300px]"><Bar data={codeGenChart} options={stackedBarOpts(true)} /></div>}
            </Card>
            <Card title="CLI vs non-CLI productivity" subtitle="Line chart — avg code generation per user per day">
              {productivityChart && <div className="h-[300px]"><Line data={productivityChart} options={lineOpts(true)} /></div>}
            </Card>
          </div>

          {/* Top CLI Users Table */}
          <Card title="Top CLI users" subtitle="Sortable table with CLI session details and code productivity">
            <DataTable
              columns={[
                { key: "displayLabel", header: "User", render: (value: unknown) => <span className="font-medium text-gray-900">{String(value)}</span> },
                { key: "daysActive", header: "Days Active", align: "right" },
                { key: "sessions", header: "Sessions", align: "right", render: (value: unknown) => Number(value).toLocaleString() },
                { key: "requests", header: "Requests", align: "right", render: (value: unknown) => Number(value).toLocaleString() },
                { key: "codeGenerated", header: "Code Generated", align: "right", render: (value: unknown) => Number(value).toLocaleString() },
                { key: "codeAccepted", header: "Code Accepted", align: "right", render: (value: unknown) => Number(value).toLocaleString() },
                { key: "acceptanceRate", header: "Accept %", align: "right", render: (value: unknown) => `${value}%` },
                { key: "locAdded", header: "LOC Added", align: "right", render: (value: unknown) => Number(value).toLocaleString() },
                { key: "tokens", header: "Tokens", align: "right", render: (value: unknown) => fmtNum(Number(value)) },
              ]}
              data={(data?.topCliUsers ?? []) as unknown as Record<string, unknown>[]}
              emptyMessage="No CLI users found"
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
    <div className="rounded-lg border border-gray-200 bg-white shadow-xs">
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
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-xs">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
