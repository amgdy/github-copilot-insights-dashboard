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

import { useChartOptions } from "@/lib/theme/chart-theme";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { ReportFilters, DataSourceBanner, formatDateRangeLabel, type FilterState, type DataRange } from "@/components/layout/report-filters";
import { ConfigurationBanner } from "@/components/layout/configuration-banner";
import { EmptyState } from "@/components/ui/empty-state";

/* ── Component ── */

export default function CliPage() {
  const { commonOptions, doughnutOptions, legendPreset } = useChartOptions();
  const { t } = useTranslation();
  const [data, setData] = useState<CliData | null>(null);
  const [loading, setLoading] = useState(true);
  const { ref: reportRef, ExportButton: PdfButton } = usePdfExport("copilot-cli");
  const [dataRange, setDataRange] = useState<DataRange | null>(null);

  const [appliedFilters, setAppliedFilters] = useState<FilterState | null>(null);

  const fetchData = useCallback(async (filters: FilterState) => {
    setAppliedFilters(filters);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.set("start", filters.startDate);
      if (filters.endDate) params.set("end", filters.endDate);
      if (filters.userId) params.set("userId", filters.userId);
      if (filters.orgId) params.set("orgId", filters.orgId);
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
    plugins: { ...commonOptions.plugins, legend: { ...legendPreset, display: showLegend } },
  });

  const stackedBarOpts = (showLegend = true) => ({
    ...commonOptions,
    plugins: { ...commonOptions.plugins, legend: { ...legendPreset, display: showLegend } },
    scales: {
      ...commonOptions.scales,
      x: { ...commonOptions.scales.x, stacked: true },
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
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t("cli.title")}</h1>
          <p className="text-sm text-gray-500">
            {t("cli.subtitle")}{appliedFilters ? ` — ${formatDateRangeLabel(appliedFilters.startDate, appliedFilters.endDate)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PdfButton />
          <ReportFilters onApply={fetchData} onDataRange={setDataRange} />
        </div>
      </div>
      <DataSourceBanner />

      {loading && !data ? (
        <LoadingSpinner message={t("cli.loadingCli")} />
      ) : !data || data.cliUsersOverTime.length === 0 ? (
        <EmptyState hasData={!!dataRange?.lastSyncAt} />
      ) : (
        <>
          {/* KPI Cards – Row 1: Adoption */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Kpi label={t("cli.cliUsers")} value={kpi?.cliUsers ?? 0} sub={t("cli.ofActive", kpi?.activeUsers ?? 0)} />
            <Kpi label={t("cli.adoptionRate")} value={`${kpi?.cliAdoptionRate ?? 0}%`} sub={t("cli.activeUsersUsingCli")} />
            <Kpi label={t("cli.acceptanceRate")} value={`${kpi?.cliAcceptanceRate ?? 0}%`} sub={t("cli.codeAcceptedFromCli")} />
            <Kpi label={t("cli.locAdded")} value={fmtNum(kpi?.cliLocAdded ?? 0)} sub={t("cli.byCliUsers")} />
            <Kpi label={t("cli.codeGenShare")} value={`${kpi?.cliCodeGenShare ?? 0}%`} sub={t("cli.ofTotalCodeGen")} />
          </div>

          {/* KPI Cards – Row 2: CLI Activity (from factCliDaily) */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Kpi label={t("cli.cliSessions")} value={fmtNum(kpi?.totalSessions ?? 0)} sub={t("cli.totalSessions")} />
            <Kpi label={t("cli.cliRequests")} value={fmtNum(kpi?.totalRequests ?? 0)} sub={t("cli.totalRequests")} />
            <Kpi label={t("cli.promptTokens")} value={fmtNum(kpi?.totalPromptTokens ?? 0)} sub={t("cli.inputTokenConsumption")} />
            <Kpi label={t("cli.completionTokens")} value={fmtNum(kpi?.totalCompletionTokens ?? 0)} sub={t("cli.outputTokenConsumption")} />
          </div>

          {/* CLI Users Over Time */}
          <Card title={t("cli.cliUsersOverTime")} subtitle={t("cli.cliUsersOverTimeDesc")}>
            {cliUsersChart && <div className="h-[300px]"><Line data={cliUsersChart} options={lineOpts(true)} /></div>}
          </Card>

          {/* CLI Sessions & Requests + Token Usage */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title={t("cli.cliSessionsRequests")} subtitle={t("cli.cliSessionsRequestsDesc")}>
              {cliActivityChart ? (
                <div className="h-[300px]"><Line data={cliActivityChart} options={lineOpts(true)} /></div>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-sm text-gray-400">{t("cli.noCliSessionData")}</div>
              )}
            </Card>
            <Card title={t("cli.tokenConsumption")} subtitle={t("cli.tokenConsumptionDesc")}>
              {tokenUsageChart ? (
                <div className="h-[300px]"><Bar data={tokenUsageChart} options={stackedBarOpts(true)} /></div>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-sm text-gray-400">{t("cli.noTokenData")}</div>
              )}
            </Card>
          </div>

          {/* Weekly Adoption Rate + CLI Version Distribution */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title={t("cli.weeklyCliAdoptionRate")} subtitle={t("cli.weeklyCliAdoptionRateDesc")}>
              {weeklyAdoptionChart && <div className="h-[300px]"><Bar data={weeklyAdoptionChart} options={percentOpts} /></div>}
            </Card>
            <Card title={t("cli.cliVersionDistribution")} subtitle={t("cli.cliVersionDistributionDesc")}>
              {versionDonut ? (
                <div className="h-[320px]"><Doughnut data={versionDonut} options={doughnutOpts} /></div>
              ) : (
                <div className="flex h-[320px] items-center justify-center text-sm text-gray-400">{t("cli.noVersionData")}</div>
              )}
            </Card>
          </div>

          {/* CLI vs Non-CLI Code Generation + Productivity */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title={t("cli.cliVsNonCli")} subtitle={t("cli.cliVsNonCliDesc")}>
              {codeGenChart && <div className="h-[300px]"><Bar data={codeGenChart} options={stackedBarOpts(true)} /></div>}
            </Card>
            <Card title={t("cli.cliVsNonCliProductivity")} subtitle={t("cli.cliVsNonCliProductivityDesc")}>
              {productivityChart && <div className="h-[300px]"><Line data={productivityChart} options={lineOpts(true)} /></div>}
            </Card>
          </div>

          {/* Top CLI Users Table */}
          <Card title={t("cli.topCliUsers")} subtitle={t("cli.topCliUsersDesc")}>
            <DataTable
              columns={[
                { key: "displayLabel", header: t("common.user"), render: (value: unknown) => <span className="font-medium text-gray-900 dark:text-gray-100">{String(value)}</span> },
                { key: "daysActive", header: t("common.daysActive"), align: "right" },
                { key: "sessions", header: t("cli.sessions"), align: "right", render: (value: unknown) => Number(value).toLocaleString() },
                { key: "requests", header: t("cli.requests"), align: "right", render: (value: unknown) => Number(value).toLocaleString() },
                { key: "codeGenerated", header: t("common.codeGenerated"), align: "right", render: (value: unknown) => Number(value).toLocaleString() },
                { key: "codeAccepted", header: t("common.codeAccepted"), align: "right", render: (value: unknown) => Number(value).toLocaleString() },
                { key: "acceptanceRate", header: t("common.acceptPercent"), align: "right", render: (value: unknown) => `${value}%` },
                { key: "locAdded", header: t("common.locAdded"), align: "right", render: (value: unknown) => Number(value).toLocaleString() },
                { key: "tokens", header: t("cli.tokens"), align: "right", render: (value: unknown) => fmtNum(Number(value)) },
              ]}
              data={(data?.topCliUsers ?? []) as unknown as Record<string, unknown>[]}
              emptyMessage={t("cli.noCliUsersFound")}
              searchPlaceholder={t("common.searchUsersEllipsis")}
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
