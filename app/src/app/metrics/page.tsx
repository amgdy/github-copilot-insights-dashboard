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
  Title,
} from "chart.js";
import { Line, Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
  Title
);

/* ── Types ── */

interface DashboardData {
  period: { start: string; end: string };
  kpis: {
    activeUsers: number;
    agentUsers: number;
    agentAdoptionRate: number;
    chatUsers: number;
    cliUsers: number;
    totalInteractions: number;
    totalCodeGen: number;
    totalCodeAccept: number;
    mostUsedChatModel: string;
  };
  dailyActiveUsers: Array<{ date: string; value: number }>;
  weeklyActiveUsers: Array<{ date: string; value: number }>;
  avgChatRequestsPerUser: Array<{ date: string; value: number }>;
  requestsPerChatMode: Array<Record<string, string | number>>;
  codeCompletions: Array<{ date: string; suggested: number; accepted: number }>;
  modelUsagePerDay: Array<Record<string, string | number>>;
  chatModelUsage: Array<{ name: string; value: number }>;
  modelUsagePerChatMode: Array<Record<string, string | number>>;
  languageUsagePerDay: Array<Record<string, string | number>>;
  languageUsage: Array<{ name: string; value: number }>;
  modelUsagePerLanguage: Array<Record<string, string | number>>;
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

export default function CopilotUsagePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (filters: FilterState) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.set("start", filters.startDate);
      if (filters.endDate) params.set("end", filters.endDate);
      if (filters.userId) params.set("userId", filters.userId);
      const res = await fetch(`/api/metrics/dashboard?${params}`);
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("Failed to fetch copilot usage data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const kpi = data?.kpis;

  /* ── Chart data builders (memoized) ── */

  const dailyActiveChart = useMemo(() => {
    if (!data) return null;
    return {
      labels: data.dailyActiveUsers.map((d) => fmtDate(d.date)),
      datasets: [{
        label: "Users",
        data: data.dailyActiveUsers.map((d) => Number(d.value)),
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      }],
    };
  }, [data]);

  const weeklyActiveChart = useMemo(() => {
    if (!data) return null;
    return {
      labels: data.weeklyActiveUsers.map((d) => fmtWeek(d.date)),
      datasets: [{
        label: "Users",
        data: data.weeklyActiveUsers.map((d) => Number(d.value)),
        backgroundColor: "#3b82f6",
        borderRadius: 4,
      }],
    };
  }, [data]);

  const avgChatChart = useMemo(() => {
    if (!data) return null;
    return {
      labels: data.avgChatRequestsPerUser.map((d) => fmtDate(d.date)),
      datasets: [{
        label: "Requests/User",
        data: data.avgChatRequestsPerUser.map((d) => Number(d.value)),
        borderColor: "#22c55e",
        backgroundColor: "rgba(34, 197, 94, 0.1)",
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      }],
    };
  }, [data]);

  const chatModeChart = useMemo(() => {
    if (!data) return null;
    const keys = extractDimKeys(data.requestsPerChatMode).sort();
    return {
      labels: data.requestsPerChatMode.map((r) => fmtDate(String(r.date))),
      datasets: keys.map((k, i) => ({
        label: k,
        data: data.requestsPerChatMode.map((r) => Number(r[k]) || 0),
        backgroundColor: COLORS[i % COLORS.length],
      })),
    };
  }, [data]);

  const codeCompChart = useMemo(() => {
    if (!data) return null;
    return {
      labels: data.codeCompletions.map((d) => fmtDate(d.date)),
      datasets: [
        {
          label: "Accepted",
          data: data.codeCompletions.map((d) => Number(d.accepted)),
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        },
        {
          label: "Suggested",
          data: data.codeCompletions.map((d) => Number(d.suggested)),
          borderColor: "#a78bfa",
          backgroundColor: "rgba(167, 139, 250, 0.08)",
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        },
      ],
    };
  }, [data]);

  const acceptanceRateChart = useMemo(() => {
    if (!data) return null;
    return {
      labels: data.codeCompletions.map((d) => fmtDate(d.date)),
      datasets: [{
        label: "Acceptance Rate %",
        data: data.codeCompletions.map((d) =>
          Number(d.suggested) > 0
            ? Math.round((Number(d.accepted) / Number(d.suggested)) * 1000) / 10
            : 0
        ),
        borderColor: "#22c55e",
        backgroundColor: "rgba(34, 197, 94, 0.1)",
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      }],
    };
  }, [data]);

  const modelPerDayChart = useMemo(() => {
    if (!data) return null;
    const keys = extractDimKeys(data.modelUsagePerDay).sort();
    return {
      labels: data.modelUsagePerDay.map((r) => fmtDate(String(r.date))),
      datasets: keys.map((k, i) => ({
        label: k,
        data: data.modelUsagePerDay.map((r) => Number(r[k]) || 0),
        backgroundColor: COLORS[i % COLORS.length],
        fill: true,
      })),
    };
  }, [data]);

  const chatModelDonut = useMemo(() => {
    if (!data) return null;
    const items = topN(data.chatModelUsage);
    return {
      labels: items.map((d) => d.name),
      datasets: [{
        data: items.map((d) => d.value),
        backgroundColor: items.map((_, i) => COLORS[i % COLORS.length]),
        borderWidth: 0,
      }],
    };
  }, [data]);

  const modelPerChatModeChart = useMemo(() => {
    if (!data) return null;
    const keys = extractDimKeys(data.modelUsagePerChatMode).sort();
    return {
      labels: data.modelUsagePerChatMode.map((r) => String(r.name)),
      datasets: keys.map((k, i) => ({
        label: k,
        data: data.modelUsagePerChatMode.map((r) => Number(r[k]) || 0),
        backgroundColor: COLORS[i % COLORS.length],
      })),
    };
  }, [data]);

  const langPerDayChart = useMemo(() => {
    if (!data) return null;
    const keys = extractDimKeys(data.languageUsagePerDay).sort();
    return {
      labels: data.languageUsagePerDay.map((r) => fmtDate(String(r.date))),
      datasets: keys.map((k, i) => ({
        label: k,
        data: data.languageUsagePerDay.map((r) => Number(r[k]) || 0),
        backgroundColor: COLORS[i % COLORS.length],
        fill: true,
      })),
    };
  }, [data]);

  const langDonut = useMemo(() => {
    if (!data) return null;
    const items = topN(data.languageUsage);
    return {
      labels: items.map((d) => d.name),
      datasets: [{
        data: items.map((d) => d.value),
        backgroundColor: items.map((_, i) => COLORS[i % COLORS.length]),
        borderWidth: 0,
      }],
    };
  }, [data]);

  const modelPerLangChart = useMemo(() => {
    if (!data) return null;
    const keys = extractDimKeys(data.modelUsagePerLanguage).sort();
    return {
      labels: data.modelUsagePerLanguage.map((r) => String(r.name)),
      datasets: keys.map((k, i) => ({
        label: k,
        data: data.modelUsagePerLanguage.map((r) => Number(r[k]) || 0),
        backgroundColor: COLORS[i % COLORS.length],
      })),
    };
  }, [data]);

  /* ── Reusable chart option presets ── */

  const lineOpts = (showLegend = false) => ({
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

  const horizontalStackedOpts = (showLegend = true) => ({
    ...commonOptions,
    indexAxis: "y" as const,
    plugins: { ...commonOptions.plugins, legend: { display: showLegend, position: "top" as const, labels: { usePointStyle: true, pointStyle: "circle" as const, font: { size: 11 } } } },
    scales: {
      x: { ...commonOptions.scales.y, stacked: true },
      y: { ...commonOptions.scales.x, stacked: true },
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

  const stackedAreaOpts = (showLegend = true) => ({
    ...commonOptions,
    plugins: { ...commonOptions.plugins, legend: { display: showLegend, position: "top" as const, labels: { usePointStyle: true, pointStyle: "circle" as const, font: { size: 11 } } } },
    scales: {
      ...commonOptions.scales,
      x: { ...commonOptions.scales.x },
      y: { ...commonOptions.scales.y, stacked: true },
    },
  });

  return (
    <div className="space-y-6">
      {/* Header + Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">GitHub Copilot Usage</h1>
          <p className="text-sm text-gray-500">
            Usage metrics, adoption trends, and model analytics
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Kpi label="Active Users" value={kpi?.activeUsers ?? 0} />
            <Kpi label="Agent Adoption" value={`${kpi?.agentAdoptionRate ?? 0}%`} />
            <Kpi label="Total Interactions" value={kpi?.totalInteractions ?? 0} />
            <Kpi label="Code Accepted" value={kpi?.totalCodeAccept ?? 0} />
            <Kpi label="Top Model" value={kpi?.mostUsedChatModel ?? "N/A"} small />
          </div>

          {/* Daily + Weekly Active Users */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Daily active users" subtitle="Area chart — daily unique Copilot users">
              {dailyActiveChart && <div className="h-[300px]"><Line data={dailyActiveChart} options={lineOpts()} /></div>}
            </Card>
            <Card title="Weekly active users" subtitle="Bar chart — weekly unique Copilot users">
              {weeklyActiveChart && <div className="h-[300px]"><Bar data={weeklyActiveChart} options={{ ...commonOptions }} /></div>}
            </Card>
          </div>

          {/* Average Chat Requests */}
          <Card title="Average chat requests per active user" subtitle="Area chart — daily average excluding code completions">
            {avgChatChart && <div className="h-[300px]"><Line data={avgChatChart} options={lineOpts()} /></div>}
          </Card>

          {/* Requests per Chat Mode */}
          <Card title="Requests per chat mode" subtitle="Stacked bar chart — user-initiated requests by mode">
            {chatModeChart && <div className="h-[350px]"><Bar data={chatModeChart} options={stackedBarOpts()} /></div>}
          </Card>

          {/* Code Completions */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Code completions" subtitle="Area chart — suggested vs accepted completions">
              {codeCompChart && <div className="h-[300px]"><Line data={codeCompChart} options={lineOpts(true)} /></div>}
            </Card>
            <Card title="Acceptance rate" subtitle="Area chart — % of suggested completions accepted">
              {acceptanceRateChart && <div className="h-[300px]"><Line data={acceptanceRateChart} options={lineOpts()} /></div>}
            </Card>
          </div>

          {/* Model Usage per Day */}
          <Card title="Model usage per day" subtitle="Stacked area chart — daily model breakdown">
            {modelPerDayChart && <div className="h-[350px]"><Line data={modelPerDayChart} options={stackedAreaOpts()} /></div>}
          </Card>

          {/* Chat Model Usage + Model per Chat Mode */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Chat model usage" subtitle="Doughnut chart — model distribution">
              {chatModelDonut && <div className="h-[320px]"><Doughnut data={chatModelDonut} options={doughnutOpts} /></div>}
            </Card>
            <Card title="Model usage per chat mode" subtitle="Horizontal stacked bar — models by feature">
              {modelPerChatModeChart && (
                <div className="h-[320px]"><Bar data={modelPerChatModeChart} options={horizontalStackedOpts()} /></div>
              )}
            </Card>
          </div>

          {/* Language Usage per Day */}
          <Card title="Language usage per day" subtitle="Stacked area chart — daily language breakdown">
            {langPerDayChart && <div className="h-[350px]"><Line data={langPerDayChart} options={stackedAreaOpts()} /></div>}
          </Card>

          {/* Language Usage + Model per Language */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Language usage" subtitle="Doughnut chart — language distribution">
              {langDonut && <div className="h-[320px]"><Doughnut data={langDonut} options={doughnutOpts} /></div>}
            </Card>
            <Card title="Model usage per language" subtitle="Horizontal stacked bar — models by language">
              {modelPerLangChart && (
                <div className="h-[320px]"><Bar data={modelPerLangChart} options={horizontalStackedOpts()} /></div>
              )}
            </Card>
          </div>
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

function Kpi({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 font-bold text-gray-900 ${small ? "text-base" : "text-2xl"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
