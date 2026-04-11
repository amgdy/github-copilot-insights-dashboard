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
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { usePdfExport } from "@/components/ui/pdf-export";

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
    totalCopilotUsers: number;
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

import { ReportFilters, DataSourceBanner, formatDateRangeLabel, type FilterState, type DataRange } from "@/components/layout/report-filters";
import { MultiSelect } from "@/components/ui/multi-select";
import { useChartOptions } from "@/lib/theme/chart-theme";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { ConfigurationBanner } from "@/components/layout/configuration-banner";
import { EmptyState } from "@/components/ui/empty-state";

/* ── Component ── */

export default function CopilotUsagePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [appliedFilters, setAppliedFilters] = useState<FilterState | null>(null);
  const [dataRange, setDataRange] = useState<DataRange | null>(null);
  const { ref: reportRef, ExportButton: PdfButton } = usePdfExport("copilot-usage");
  const { commonOptions, doughnutOptions: baseDoughnutOptions, legendPreset } = useChartOptions();
  const { t } = useTranslation();

  // Multi-select chart filters
  const [modelPerDayFilter, setModelPerDayFilter] = useState<string[]>([]);
  const [modelPerChatModeFilter, setModelPerChatModeFilter] = useState<string[]>([]);
  const [modelPerLangModelFilter, setModelPerLangModelFilter] = useState<string[]>([]);
  const [modelPerLangLangFilter, setModelPerLangLangFilter] = useState<string[]>([]);

  const fetchData = useCallback(async (filters: FilterState) => {
    setAppliedFilters(filters);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.set("start", filters.startDate);
      if (filters.endDate) params.set("end", filters.endDate);
      if (filters.userId) params.set("userId", filters.userId);
      if (filters.orgId) params.set("orgId", filters.orgId);
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
    const allKeys = extractDimKeys(data.modelUsagePerDay).sort();
    const keys = modelPerDayFilter.length > 0 ? allKeys.filter((k) => modelPerDayFilter.includes(k)) : allKeys;
    return {
      labels: data.modelUsagePerDay.map((r) => fmtDate(String(r.date))),
      datasets: keys.map((k, i) => ({
        label: k,
        data: data.modelUsagePerDay.map((r) => Number(r[k]) || 0),
        backgroundColor: COLORS[allKeys.indexOf(k) % COLORS.length],
        fill: true,
      })),
    };
  }, [data, modelPerDayFilter]);

  // Available model names for the per-day filter
  const modelPerDayOptions = useMemo(() => {
    if (!data) return [];
    return extractDimKeys(data.modelUsagePerDay).sort();
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
    const allKeys = extractDimKeys(data.modelUsagePerChatMode).sort();
    const keys = modelPerChatModeFilter.length > 0 ? allKeys.filter((k) => modelPerChatModeFilter.includes(k)) : allKeys;
    return {
      labels: data.modelUsagePerChatMode.map((r) => String(r.name)),
      datasets: keys.map((k, i) => ({
        label: k,
        data: data.modelUsagePerChatMode.map((r) => Number(r[k]) || 0),
        backgroundColor: COLORS[allKeys.indexOf(k) % COLORS.length],
      })),
    };
  }, [data, modelPerChatModeFilter]);

  // Available model names for the per-chat-mode filter
  const modelPerChatModeOptions = useMemo(() => {
    if (!data) return [];
    return extractDimKeys(data.modelUsagePerChatMode).sort();
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
    const allModelKeys = extractDimKeys(data.modelUsagePerLanguage).sort();
    const modelKeys = modelPerLangModelFilter.length > 0
      ? allModelKeys.filter((k) => modelPerLangModelFilter.includes(k))
      : allModelKeys;
    // Filter languages (rows) if language filter is applied
    const allLangs = data.modelUsagePerLanguage.map((r) => String(r.name));
    const filteredData = modelPerLangLangFilter.length > 0
      ? data.modelUsagePerLanguage.filter((r) => modelPerLangLangFilter.includes(String(r.name)))
      : data.modelUsagePerLanguage;
    return {
      labels: filteredData.map((r) => String(r.name)),
      datasets: modelKeys.map((k, i) => ({
        label: k,
        data: filteredData.map((r) => Number(r[k]) || 0),
        backgroundColor: COLORS[allModelKeys.indexOf(k) % COLORS.length],
      })),
    };
  }, [data, modelPerLangModelFilter, modelPerLangLangFilter]);

  // Available options for the model-per-language filters
  const modelPerLangModelOptions = useMemo(() => {
    if (!data) return [];
    return extractDimKeys(data.modelUsagePerLanguage).sort();
  }, [data]);

  const modelPerLangLangOptions = useMemo(() => {
    if (!data) return [];
    return data.modelUsagePerLanguage.map((r) => String(r.name)).sort();
  }, [data]);

  /* ── Reusable chart option presets ── */

  const lineOpts = (showLegend = false) => ({
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

  const horizontalStackedOpts = (showLegend = true) => ({
    ...commonOptions,
    indexAxis: "y" as const,
    plugins: { ...commonOptions.plugins, legend: { ...legendPreset, display: showLegend } },
    scales: {
      x: { ...commonOptions.scales.y, stacked: true },
      y: { ...commonOptions.scales.x, stacked: true },
    },
  });

  const doughnutOpts = baseDoughnutOptions;

  const stackedAreaOpts = (showLegend = true) => ({
    ...commonOptions,
    plugins: { ...commonOptions.plugins, legend: { ...legendPreset, display: showLegend } },
    scales: {
      ...commonOptions.scales,
      x: { ...commonOptions.scales.x },
      y: { ...commonOptions.scales.y, stacked: true },
    },
  });

  return (
    <div ref={reportRef} className="space-y-6">
      <ConfigurationBanner />
      {/* Header + Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t("dashboard.title")}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
{t("dashboard.subtitle")}{appliedFilters ? ` — ${formatDateRangeLabel(appliedFilters.startDate, appliedFilters.endDate)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PdfButton />
          <ReportFilters onApply={fetchData} onDataRange={setDataRange} />
        </div>
      </div>
      <DataSourceBanner />

      {loading && !data ? (
        <LoadingSpinner message={t("dashboard.loadingMetrics")} />
      ) : !data || data.dailyActiveUsers.length === 0 ? (
        <EmptyState hasData={!!dataRange?.lastSyncAt} />
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Kpi label={t("dashboard.activeUsers")} value={kpi?.activeUsers ?? 0} sub={t("dashboard.ofTotal", kpi?.totalCopilotUsers ?? 0)} />
            <Kpi label={t("dashboard.agentAdoption")} value={`${kpi?.agentAdoptionRate ?? 0}%`} />
            <Kpi label={t("dashboard.totalInteractions")} value={kpi?.totalInteractions ?? 0} />
            <Kpi label={t("dashboard.codeAccepted")} value={kpi?.totalCodeAccept ?? 0} />
            <Kpi label={t("dashboard.topModel")} value={kpi?.mostUsedChatModel ?? "N/A"} small />
          </div>

          {/* Daily + Weekly Active Users */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title={t("dashboard.dailyActiveUsers")} subtitle={t("dashboard.dailyActiveUsersDesc")}>
              {dailyActiveChart && <div className="h-[300px]"><Line data={dailyActiveChart} options={lineOpts()} /></div>}
            </Card>
            <Card title={t("dashboard.weeklyActiveUsers")} subtitle={t("dashboard.weeklyActiveUsersDesc")}>
              {weeklyActiveChart && <div className="h-[300px]"><Bar data={weeklyActiveChart} options={{ ...commonOptions }} /></div>}
            </Card>
          </div>

          {/* Average Chat Requests */}
          <Card title={t("dashboard.avgChatRequests")} subtitle={t("dashboard.avgChatRequestsDesc")}>
            {avgChatChart && <div className="h-[300px]"><Line data={avgChatChart} options={lineOpts()} /></div>}
          </Card>

          {/* Requests per Chat Mode */}
          <Card title={t("dashboard.requestsPerChatMode")} subtitle={t("dashboard.requestsPerChatModeDesc")}>
            {chatModeChart && <div className="h-[350px]"><Bar data={chatModeChart} options={stackedBarOpts()} /></div>}
          </Card>

          {/* Code Completions */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title={t("dashboard.codeCompletions")} subtitle={t("dashboard.codeCompletionsDesc")}>
              {codeCompChart && <div className="h-[300px]"><Line data={codeCompChart} options={lineOpts(true)} /></div>}
            </Card>
            <Card title={t("dashboard.acceptanceRate")} subtitle={t("dashboard.acceptanceRateDesc")}>
              {acceptanceRateChart && <div className="h-[300px]"><Line data={acceptanceRateChart} options={lineOpts()} /></div>}
            </Card>
          </div>

          {/* Model Usage per Day */}
          <Card title={t("dashboard.modelUsagePerDay")} subtitle={t("dashboard.modelUsagePerDayDesc")}
            headerRight={
              <MultiSelect
                options={modelPerDayOptions}
                selected={modelPerDayFilter}
                onChange={setModelPerDayFilter}
                placeholder={t("dashboard.allModels")}
                label={t("dashboard.models")}
              />
            }
          >
            {modelPerDayChart && <div className="h-[350px]"><Line data={modelPerDayChart} options={stackedAreaOpts()} /></div>}
          </Card>

          {/* Chat Model Usage + Model per Chat Mode */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title={t("dashboard.chatModelUsage")} subtitle={t("dashboard.chatModelUsageDesc")}>
              {chatModelDonut && <div className="h-[320px]"><Doughnut data={chatModelDonut} options={doughnutOpts} /></div>}
            </Card>
            <Card title={t("dashboard.modelUsagePerChatMode")} subtitle={t("dashboard.modelUsagePerChatModeDesc")}
              headerRight={
                <MultiSelect
                  options={modelPerChatModeOptions}
                  selected={modelPerChatModeFilter}
                  onChange={setModelPerChatModeFilter}
                  placeholder={t("dashboard.allModels")}
                  label={t("dashboard.models")}
                />
              }
            >
              {modelPerChatModeChart && (
                <div className="h-[320px]"><Bar data={modelPerChatModeChart} options={horizontalStackedOpts()} /></div>
              )}
            </Card>
          </div>

          {/* Language Usage per Day */}
          <Card title={t("dashboard.languageUsagePerDay")} subtitle={t("dashboard.languageUsagePerDayDesc")}>
            {langPerDayChart && <div className="h-[350px]"><Line data={langPerDayChart} options={stackedAreaOpts()} /></div>}
          </Card>

          {/* Language Usage + Model per Language */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title={t("dashboard.languageUsage")} subtitle={t("dashboard.languageUsageDesc")}>
              {langDonut && <div className="h-[320px]"><Doughnut data={langDonut} options={doughnutOpts} /></div>}
            </Card>
            <Card title={t("dashboard.modelUsagePerLanguage")} subtitle={t("dashboard.modelUsagePerLanguageDesc")}
              headerRight={
                <div className="flex flex-wrap gap-2">
                  <MultiSelect
                    options={modelPerLangModelOptions}
                    selected={modelPerLangModelFilter}
                    onChange={setModelPerLangModelFilter}
                    placeholder={t("dashboard.allModels")}
                    label={t("dashboard.models")}
                  />
                  <MultiSelect
                    options={modelPerLangLangOptions}
                    selected={modelPerLangLangFilter}
                    onChange={setModelPerLangLangFilter}
                    placeholder={t("dashboard.allLanguages")}
                    label={t("dashboard.languages")}
                  />
                </div>
              }
            >
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

function Card({ title, subtitle, headerRight, children }: { title: string; subtitle?: string; headerRight?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-xs dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
        {headerRight && <div>{headerRight}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Kpi({ label, value, small, sub }: { label: string; value: string | number; small?: boolean; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 font-bold text-gray-900 dark:text-gray-100 ${small ? "text-base" : "text-2xl"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  );
}
