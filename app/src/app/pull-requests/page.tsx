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
import { ReportFilters, DataSourceBanner } from "@/components/layout/report-filters";
import type { FilterState, DataRange } from "@/components/layout/report-filters";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { useChartOptions } from "@/lib/theme/chart-theme";
import { ConfigurationBanner } from "@/components/layout/configuration-banner";
import { EmptyState } from "@/components/ui/empty-state";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Filler, Tooltip, Legend
);

/* ── Types ── */

interface DailyPR {
  day: string;
  orgId: number | null;
  scope: string;
  dailyActiveUsers: number | null;
  prTotalCreated: number | null;
  prTotalReviewed: number | null;
  prTotalMerged: number | null;
  prMedianMinutesToMerge: string | null;
  prTotalCreatedByCopilot: number | null;
  prTotalReviewedByCopilot: number | null;
  prTotalMergedCreatedByCopilot: number | null;
  prMedianMinutesToMergeCopilotAuthored: string | null;
  prTotalSuggestions: number | null;
  prTotalAppliedSuggestions: number | null;
  prTotalCopilotSuggestions: number | null;
  prTotalCopilotAppliedSuggestions: number | null;
}

interface OrgBreakdown {
  orgId: number | null;
  orgName: string | null;
  totalCreated: number;
  totalMerged: number;
  totalCreatedByCopilot: number;
  totalMergedCreatedByCopilot: number;
  totalReviewedByCopilot: number;
  totalCopilotSuggestions: number;
  totalCopilotAppliedSuggestions: number;
}

interface PRData {
  daily: DailyPR[];
  totals: {
    totalCreated: number;
    totalReviewed: number;
    totalMerged: number;
    totalCreatedByCopilot: number;
    totalReviewedByCopilot: number;
    totalMergedCreatedByCopilot: number;
    totalMergedReviewedByCopilot: number;
    totalSuggestions: number;
    totalAppliedSuggestions: number;
    totalCopilotSuggestions: number;
    totalCopilotAppliedSuggestions: number;
    avgMedianMinutesToMerge: number | null;
    avgMedianMinutesToMergeCopilot: number | null;
    avgMedianMinutesToMergeCopilotReviewed: number | null;
  };
  orgBreakdown: OrgBreakdown[];
}

/* ── Helpers ── */

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "–";
  return n.toLocaleString();
}

function fmtPct(numerator: number, denominator: number): string {
  if (!denominator) return "–";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function fmtMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return "–";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/* ── Component ── */

export default function PullRequestsPage() {
  const [data, setData] = useState<PRData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataRange, setDataRange] = useState<DataRange | null>(null);
  const { ref: reportRef, ExportButton: PdfButton } = usePdfExport("copilot-pull-requests");
  const { t } = useTranslation();
  const { commonOptions, doughnutOptions, legendPreset } = useChartOptions();

  const fetchData = useCallback(async (filters: FilterState) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.startDate) params.set("start", filters.startDate);
    if (filters.endDate) params.set("end", filters.endDate);
    if (filters.orgId) params.set("orgId", filters.orgId);
    const res = await fetch(`/api/metrics/pull-requests?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  const totals = data?.totals;
  const daily = data?.daily ?? [];
  const labels = [...new Set(daily.map((d) => d.day))].sort();

  // Aggregate daily data (sum across orgs if multiple)
  const aggByDay = new Map<string, { created: number; merged: number; copilotCreated: number; copilotMerged: number; ttm: number[]; ttmCopilot: number[]; reviewedByCopilot: number; copilotSuggestions: number; copilotApplied: number; reviewed: number }>();
  for (const row of daily) {
    const existing = aggByDay.get(row.day) ?? { created: 0, merged: 0, copilotCreated: 0, copilotMerged: 0, ttm: [], ttmCopilot: [], reviewedByCopilot: 0, copilotSuggestions: 0, copilotApplied: 0, reviewed: 0 };
    existing.created += row.prTotalCreated ?? 0;
    existing.merged += row.prTotalMerged ?? 0;
    existing.copilotCreated += row.prTotalCreatedByCopilot ?? 0;
    existing.copilotMerged += row.prTotalMergedCreatedByCopilot ?? 0;
    existing.reviewedByCopilot += row.prTotalReviewedByCopilot ?? 0;
    existing.copilotSuggestions += row.prTotalCopilotSuggestions ?? 0;
    existing.copilotApplied += row.prTotalCopilotAppliedSuggestions ?? 0;
    existing.reviewed += row.prTotalReviewed ?? 0;
    if (row.prMedianMinutesToMerge) existing.ttm.push(parseFloat(row.prMedianMinutesToMerge));
    if (row.prMedianMinutesToMergeCopilotAuthored) existing.ttmCopilot.push(parseFloat(row.prMedianMinutesToMergeCopilotAuthored));
    aggByDay.set(row.day, existing);
  }

  const copilotSuggestionApplyRate = totals?.totalCopilotSuggestions
    ? Math.round((totals.totalCopilotAppliedSuggestions / totals.totalCopilotSuggestions) * 1000) / 10
    : 0;

  /* ── Chart data (memoized) ── */

  const prActivityChart = useMemo(() => {
    if (!labels.length) return null;
    return {
      labels: labels.map(fmtDate),
      datasets: [
        { label: t("pullRequests.created"), data: labels.map((d) => aggByDay.get(d)?.created ?? 0), backgroundColor: COLORS[0] + "99" },
        { label: t("pullRequests.merged"), data: labels.map((d) => aggByDay.get(d)?.merged ?? 0), backgroundColor: COLORS[1] + "99" },
      ],
    };
  }, [labels, aggByDay, t]);

  const copilotImpactChart = useMemo(() => {
    if (!labels.length) return null;
    return {
      labels: labels.map(fmtDate),
      datasets: [
        { label: t("pullRequests.allPRsCreated"), data: labels.map((d) => aggByDay.get(d)?.created ?? 0), borderColor: COLORS[0], backgroundColor: COLORS[0] + "20", fill: true },
        { label: t("pullRequests.copilotCreatedPRs"), data: labels.map((d) => aggByDay.get(d)?.copilotCreated ?? 0), borderColor: COLORS[1], backgroundColor: COLORS[1] + "20", fill: true },
      ],
    };
  }, [labels, aggByDay, t]);

  const ttmChart = useMemo(() => {
    if (!labels.length) return null;
    return {
      labels: labels.map(fmtDate),
      datasets: [
        { label: t("pullRequests.allPRs"), data: labels.map((d) => { const arr = aggByDay.get(d)?.ttm ?? []; return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }), borderColor: COLORS[0], tension: 0.3 },
        { label: t("pullRequests.copilotAuthored"), data: labels.map((d) => { const arr = aggByDay.get(d)?.ttmCopilot ?? []; return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }), borderColor: COLORS[1], tension: 0.3 },
      ],
    };
  }, [labels, aggByDay, t]);

  const donutChart = useMemo(() => {
    if (!totals) return null;
    return {
      labels: [t("pullRequests.copilotCreated"), t("pullRequests.standard")],
      datasets: [{ data: [totals.totalCreatedByCopilot, totals.totalCreated - totals.totalCreatedByCopilot], backgroundColor: [COLORS[1], COLORS[0]], borderWidth: 0 }],
    };
  }, [totals, t]);

  const reviewChart = useMemo(() => {
    if (!labels.length) return null;
    return {
      labels: labels.map(fmtDate),
      datasets: [
        { label: t("pullRequests.totalReviewed"), data: labels.map((d) => aggByDay.get(d)?.reviewed ?? 0), borderColor: COLORS[0], backgroundColor: COLORS[0] + "20", fill: true, tension: 0.3 },
        { label: t("pullRequests.reviewedByCopilot"), data: labels.map((d) => aggByDay.get(d)?.reviewedByCopilot ?? 0), borderColor: COLORS[4], backgroundColor: COLORS[4] + "20", fill: true, tension: 0.3 },
      ],
    };
  }, [labels, aggByDay, t]);

  const suggestionsChart = useMemo(() => {
    if (!labels.length) return null;
    return {
      labels: labels.map(fmtDate),
      datasets: [
        { label: t("pullRequests.suggestions"), data: labels.map((d) => aggByDay.get(d)?.copilotSuggestions ?? 0), backgroundColor: COLORS[4] + "99" },
        { label: t("pullRequests.suggestionsApplied"), data: labels.map((d) => aggByDay.get(d)?.copilotApplied ?? 0), backgroundColor: COLORS[1] + "99" },
      ],
    };
  }, [labels, aggByDay, t]);

  const suggestionsDonut = useMemo(() => {
    if (!totals || !totals.totalCopilotSuggestions) return null;
    return {
      labels: [t("pullRequests.applied"), t("pullRequests.notApplied")],
      datasets: [{ data: [totals.totalCopilotAppliedSuggestions, totals.totalCopilotSuggestions - totals.totalCopilotAppliedSuggestions], backgroundColor: [COLORS[1], COLORS[3]], borderWidth: 0 }],
    };
  }, [totals, t]);

  /* ── Chart option presets ── */

  const chartOpts = { ...commonOptions, plugins: { ...commonOptions.plugins, legend: { ...legendPreset, display: true } } };
  const stackedOpts = { ...chartOpts, scales: { ...commonOptions.scales, x: { ...commonOptions.scales.x, stacked: true }, y: { ...commonOptions.scales.y, stacked: true } } };

  return (
    <div ref={reportRef} className="space-y-6">
      <ConfigurationBanner />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Breadcrumb items={[{ label: t("nav.pullRequests"), href: "/pull-requests" }]} />
          <h1 className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{t("pullRequests.title")}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("pullRequests.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <PdfButton />
          <ReportFilters onApply={fetchData} onDataRange={setDataRange} showUserFilter={false} sourceLabel="Organization Aggregate" />
        </div>
      </div>
      <DataSourceBanner sourceLabel="Organization aggregate data (includes pull request metrics)" />

      {loading ? (
        <LoadingSpinner message={t("pullRequests.loadingPR")} />
      ) : !data || daily.length === 0 ? (
        <EmptyState hasData={!!dataRange?.lastSyncAt} />
      ) : (
        <>
          {/* ── Pull Request KPIs ── */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t("pullRequests.prMetrics")}</h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard label={t("pullRequests.prsCreated")} value={fmtNum(totals?.totalCreated)} />
              <KpiCard label={t("pullRequests.prsMerged")} value={fmtNum(totals?.totalMerged)} />
              <KpiCard label={t("pullRequests.copilotCreatedPRs")} value={fmtNum(totals?.totalCreatedByCopilot)} subtitle={`${fmtPct(totals?.totalCreatedByCopilot ?? 0, totals?.totalCreated ?? 0)} ${t("pullRequests.ofAllPRs")}`} />
              <KpiCard label={t("pullRequests.copilotCreatedMerged")} value={fmtNum(totals?.totalMergedCreatedByCopilot)} subtitle={`${fmtPct(totals?.totalMergedCreatedByCopilot ?? 0, totals?.totalMerged ?? 0)} ${t("pullRequests.ofMerged")}`} />
              <KpiCard label={t("pullRequests.avgTTM")} value={fmtMinutes(totals?.avgMedianMinutesToMerge)} />
              <KpiCard label={t("pullRequests.avgTTMCopilot")} value={fmtMinutes(totals?.avgMedianMinutesToMergeCopilot)} subtitle={totals?.avgMedianMinutesToMerge && totals?.avgMedianMinutesToMergeCopilot ? `${((1 - totals.avgMedianMinutesToMergeCopilot / totals.avgMedianMinutesToMerge) * 100).toFixed(0)}% ${t("pullRequests.faster")}` : undefined} />
              <KpiCard label={t("pullRequests.prsReviewed")} value={fmtNum(totals?.totalReviewed)} subtitle={`${fmtNum(totals?.totalReviewedByCopilot)} ${t("pullRequests.byCopilot")}`} />
              <KpiCard label={t("pullRequests.copilotVsStandard")} value={fmtPct(totals?.totalCreatedByCopilot ?? 0, totals?.totalCreated ?? 0)} subtitle={t("pullRequests.copilotShareOfPRs")} />
            </div>
          </div>

          {/* PR Activity + Copilot Impact Charts */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title={t("pullRequests.prActivityOverTime")} subtitle={t("pullRequests.prActivityOverTimeDesc")}>
              {prActivityChart && <div className="h-[300px]"><Bar data={prActivityChart} options={chartOpts} /></div>}
            </Card>
            <Card title={t("pullRequests.copilotImpactOnPRs")} subtitle={t("pullRequests.copilotImpactOnPRsDesc")}>
              {copilotImpactChart && <div className="h-[300px]"><Line data={copilotImpactChart} options={chartOpts} /></div>}
            </Card>
          </div>

          {/* Time to Merge + Copilot vs Standard Donut */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title={t("pullRequests.timeToMerge")} subtitle={t("pullRequests.timeToMergeDesc")}>
              {ttmChart && <div className="h-[300px]"><Line data={ttmChart} options={chartOpts} /></div>}
            </Card>
            <Card title={t("pullRequests.copilotVsStandardDonut")} subtitle={t("pullRequests.copilotVsStandardDonutDesc")}>
              {donutChart && <div className="mx-auto h-[300px] max-w-[280px]"><Doughnut data={donutChart} options={doughnutOptions} /></div>}
            </Card>
          </div>

          {/* ── Copilot Code Review & Autofix ── */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t("pullRequests.copilotAutofix")}</h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard label={t("pullRequests.reviewedByCopilot")} value={fmtNum(totals?.totalReviewedByCopilot)} subtitle={`${fmtPct(totals?.totalReviewedByCopilot ?? 0, totals?.totalReviewed ?? 0)} ${t("pullRequests.ofReviewed")}`} />
              <KpiCard label={t("pullRequests.copilotSuggestions")} value={fmtNum(totals?.totalCopilotSuggestions)} subtitle={`${fmtNum(totals?.totalCopilotAppliedSuggestions)} ${t("pullRequests.suggestionsApplied")}`} />
              <KpiCard label={t("pullRequests.suggestionApplyRate")} value={`${copilotSuggestionApplyRate}%`} subtitle={t("pullRequests.suggestionsAccepted")} />
              <KpiCard label={t("pullRequests.copilotReviewedMerged")} value={fmtNum(totals?.totalMergedReviewedByCopilot)} subtitle={t("pullRequests.reviewedByAIMerged")} />
            </div>
          </div>

          {/* Review & Suggestions Charts */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title={t("pullRequests.copilotReviewOverTime")} subtitle={t("pullRequests.copilotReviewOverTimeDesc")}>
              {reviewChart && <div className="h-[300px]"><Line data={reviewChart} options={chartOpts} /></div>}
            </Card>
            <Card title={t("pullRequests.suggestionsOverTime")} subtitle={t("pullRequests.suggestionsOverTimeDesc")}>
              {suggestionsChart && <div className="h-[300px]"><Bar data={suggestionsChart} options={stackedOpts} /></div>}
            </Card>
          </div>

          {/* Suggestion Apply Rate Donut */}
          {suggestionsDonut && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card title={t("pullRequests.suggestionOutcome")} subtitle={t("pullRequests.suggestionOutcomeDesc")}>
                <div className="mx-auto h-[280px] max-w-[280px]"><Doughnut data={suggestionsDonut} options={doughnutOptions} /></div>
              </Card>
              <div />
            </div>
          )}

          {/* Org Breakdown Table */}
          {data.orgBreakdown.length > 1 && (
            <Card title={t("pullRequests.prMetricsByOrg")} subtitle={t("pullRequests.prMetricsByOrgDesc")}>
              <DataTable
                columns={[
                  { key: "orgName", header: t("pullRequests.organization") },
                  { key: "totalCreated", header: t("pullRequests.prsCreated"), align: "right" as const },
                  { key: "totalMerged", header: t("pullRequests.prsMerged"), align: "right" as const },
                  { key: "totalCreatedByCopilot", header: t("pullRequests.copilotCreated"), align: "right" as const },
                  { key: "copilotRate", header: t("pullRequests.copilotPct"), align: "right" as const },
                  { key: "totalReviewedByCopilot", header: t("pullRequests.copilotReviewed"), align: "right" as const },
                  { key: "totalCopilotSuggestions", header: t("pullRequests.suggestions"), align: "right" as const },
                  { key: "applyRate", header: t("pullRequests.applyRate"), align: "right" as const },
                ]}
                data={data.orgBreakdown.map((o) => ({
                  orgName: o.orgName ?? "Unknown",
                  totalCreated: fmtNum(o.totalCreated),
                  totalMerged: fmtNum(o.totalMerged),
                  totalCreatedByCopilot: fmtNum(o.totalCreatedByCopilot),
                  copilotRate: fmtPct(o.totalCreatedByCopilot, o.totalCreated),
                  totalReviewedByCopilot: fmtNum(o.totalReviewedByCopilot),
                  totalCopilotSuggestions: fmtNum(o.totalCopilotSuggestions),
                  applyRate: fmtPct(o.totalCopilotAppliedSuggestions, o.totalCopilotSuggestions),
                }))}
                defaultSortKey="orgName"
              />
            </Card>
          )}
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

function KpiCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-700 dark:bg-gray-800">
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
      {subtitle && <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{subtitle}</div>}
    </div>
  );
}
