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
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { usePdfExport } from "@/components/ui/pdf-export";

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
    ideAgentUsers: number;
    codingAgentUsers: number;
    ideAgentInteractions: number;
    codingAgentInteractions: number;
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

import { useChartOptions } from "@/lib/theme/chart-theme";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { ReportFilters, DataSourceBanner, formatDateRangeLabel, type FilterState, type DataRange } from "@/components/layout/report-filters";
import { ConfigurationBanner } from "@/components/layout/configuration-banner";
import { EmptyState } from "@/components/ui/empty-state";

/* ── Component ── */

export default function AgentsPage() {
  const { commonOptions, doughnutOptions, legendPreset } = useChartOptions();
  const { t } = useTranslation();
  const [data, setData] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [appliedFilters, setAppliedFilters] = useState<FilterState | null>(null);
  const [dataRange, setDataRange] = useState<DataRange | null>(null);
  const { ref: reportRef, ExportButton: PdfButton } = usePdfExport("copilot-agents");

  const fetchData = useCallback(async (filters: FilterState) => {
    setAppliedFilters(filters);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.set("start", filters.startDate);
      if (filters.endDate) params.set("end", filters.endDate);
      if (filters.userId) params.set("userId", filters.userId);
      if (filters.orgId) params.set("orgId", filters.orgId);
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
    const keys = extractDimKeys(data.agentModeByDay).sort();
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
    plugins: { ...commonOptions.plugins, legend: { ...legendPreset, display: showLegend } },
  });

  const barOpts = { ...commonOptions };

  const stackedBarOpts = (showLegend = true) => ({
    ...commonOptions,
    plugins: { ...commonOptions.plugins, legend: { ...legendPreset, display: showLegend } },
    scales: {
      ...commonOptions.scales,
      x: { ...commonOptions.scales.x, stacked: true },
      y: { ...commonOptions.scales.y, stacked: true },
    },
  });

  const stackedAreaOpts = (showLegend = true) => ({
    ...commonOptions,
    plugins: { ...commonOptions.plugins, legend: { ...legendPreset, display: showLegend } },
    scales: {
      ...commonOptions.scales,
      y: { ...commonOptions.scales.y, stacked: true },
    },
  });

  const doughnutOpts = doughnutOptions;

  const percentOpts = {
    ...commonOptions,
    scales: {
      ...commonOptions.scales,
      y: { ...commonOptions.scales.y, min: 0, max: 100, ticks: { ...commonOptions.scales.y.ticks, callback: (v: unknown) => `${v}%` } },
    },
  };

  return (
    <div ref={reportRef} className="space-y-6">
      <ConfigurationBanner />
      {/* Header + Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t("agents.title")}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("agents.subtitle")}{appliedFilters ? ` — ${formatDateRangeLabel(appliedFilters.startDate, appliedFilters.endDate)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PdfButton />
          <ReportFilters onApply={fetchData} onDataRange={setDataRange} />
        </div>
      </div>
      <DataSourceBanner />

      {loading && !data ? (
        <LoadingSpinner message={t("agents.loadingAgent")} />
      ) : !data || data.agentUsersOverTime.length === 0 ? (
        <EmptyState hasData={!!dataRange?.lastSyncAt} />
      ) : (
        <>
          {/* KPI Cards — Overall Agent */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label={t("agents.agentUsers")} value={kpi?.agentUsers ?? 0} sub={t("agents.ofActive", kpi?.activeUsers ?? 0)} />
            <Kpi label={t("agents.adoptionRate")} value={`${kpi?.agentAdoptionRate ?? 0}%`} sub={t("agents.activeUsersUsingAgent")} />
            <Kpi label={t("agents.acceptanceRate")} value={`${kpi?.agentAcceptanceRate ?? 0}%`} sub={t("agents.codeAcceptedFromAgent")} />
            <Kpi label={t("agents.locAdded")} value={kpi?.agentLocAdded ?? 0} sub={t("agents.byAgentUsers")} />
          </div>

          {/* IDE Agent vs GitHub Coding Agent */}
          <Card title={t("agents.ideVsCodingAgent")} subtitle={t("agents.ideVsCodingAgentDesc")}>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi label={t("agents.ideAgentUsers")} value={kpi?.ideAgentUsers ?? 0} sub={t("agents.inIdeAgent")} />
              <Kpi label={t("agents.codingAgentUsers")} value={kpi?.codingAgentUsers ?? 0} sub={t("agents.cloudCodingAgent")} />
              <Kpi label={t("agents.ideAgentInteractions")} value={kpi?.ideAgentInteractions ?? 0} sub={t("agents.ideAgentRequests")} />
              <Kpi label={t("agents.codingAgentInteractions")} value={kpi?.codingAgentInteractions ?? 0} sub={t("agents.codingAgentRequests")} />
            </div>
          </Card>

          {/* Agent Users Over Time — Area chart with dual series */}
          <Card title={t("agents.agentUsersOverTime")} subtitle={t("agents.agentUsersOverTimeDesc")}>
            {agentUsersChart && <div className="h-[300px]"><Line data={agentUsersChart} options={lineOpts(true)} /></div>}
          </Card>

          {/* Weekly Adoption Rate — Bar chart with % axis */}
          <Card title={t("agents.weeklyAgentAdoptionRate")} subtitle={t("agents.weeklyAgentAdoptionRateDesc")}>
            {weeklyAdoptionChart && <div className="h-[300px]"><Bar data={weeklyAdoptionChart} options={percentOpts} /></div>}
          </Card>

          {/* Agent Mode Requests & Model Usage */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title={t("agents.agentModeRequests")} subtitle={t("agents.agentModeRequestsDesc")}>
              {agentModeChart ? (
                <div className="h-[300px]"><Line data={agentModeChart} options={stackedAreaOpts()} /></div>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-sm text-gray-400">No data</div>
              )}
            </Card>
            <Card title={t("agents.agentModelUsage")} subtitle={t("agents.agentModelUsageDesc")}>
              {agentModelDonut && <div className="h-[320px]"><Doughnut data={agentModelDonut} options={doughnutOpts} /></div>}
            </Card>
          </div>

          {/* Agent vs Non-Agent Code Generation — Stacked bar */}
          <Card title={t("agents.agentVsNonAgent")} subtitle={t("agents.agentVsNonAgentDesc")}>
            {codeGenChart && <div className="h-[350px]"><Bar data={codeGenChart} options={stackedBarOpts()} /></div>}
          </Card>

          {/* Top Agent Users Table */}
          <Card title={t("agents.topAgentUsers")} subtitle={t("agents.topAgentUsersDesc")}>
            <DataTable
              columns={[
                { key: "displayLabel", header: t("common.user"), render: (value: unknown) => <span className="font-medium text-gray-900 dark:text-gray-100">{String(value)}</span> },
                { key: "daysActive", header: t("agents.daysActive"), align: "right" },
                { key: "totalInteractions", header: t("agents.interactions"), align: "right", render: (value: unknown) => Number(value).toLocaleString() },
                { key: "codeGenerated", header: t("agents.codeGenerated"), align: "right", render: (value: unknown) => Number(value).toLocaleString() },
                { key: "codeAccepted", header: t("agents.codeAccepted"), align: "right", render: (value: unknown) => Number(value).toLocaleString() },
                { key: "locAdded", header: t("agents.locAdded"), align: "right", render: (value: unknown) => Number(value).toLocaleString() },
              ]}
              data={(data?.topAgentUsers ?? []) as unknown as Record<string, unknown>[]}
              emptyMessage={t("common.noResults")}
              searchPlaceholder={t("agents.searchUsers")}
              pageSize={25}
              defaultSortKey="displayLabel"
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
    <div className="rounded-lg border border-gray-200 bg-white shadow-xs dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  );
}
