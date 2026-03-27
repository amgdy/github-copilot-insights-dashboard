"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Filler, Tooltip, Legend);

/* ── Types ── */

interface CodeGenData {
  period: { start: string; end: string; days: number };
  kpis: {
    totalLocChanged: number;
    agentContribution: number;
    avgLinesDeletedByAgent: number;
  };
  dailyTotals: Array<{ date: string; added: number; deleted: number }>;
  userInitiatedByFeature: Array<{ feature: string; suggested: number; added: number }>;
  agentInitiatedByFeature: Array<{ feature: string; added: number; deleted: number }>;
  userInitiatedByModel: Array<{ model: string; suggested: number; added: number }>;
  agentInitiatedByModel: Array<{ model: string; added: number; deleted: number }>;
  userInitiatedByLanguage: Array<{ language: string; suggested: number; added: number }>;
  agentInitiatedByLanguage: Array<{ language: string; added: number; deleted: number }>;
}

import { ReportFilters, DataSourceBanner, type FilterState } from "@/components/layout/report-filters";

/* ── Helpers ── */

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return n.toLocaleString();
}

/* ── Chart palette ── */
const COLOR = {
  added: "#3730a3",       // indigo-800 (dark blue)
  deleted: "#a78bfa",     // violet-400 (light purple)
  suggested: "#1e293b",   // slate-800 (dark)
  userAdded: "#16a34a",   // green-600
};

/* ── Shared Chart Options ── */

const commonTooltip = {
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

const barOpts = (stacked = false, showLegend = true): object => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: showLegend,
      position: "top" as const,
      labels: { usePointStyle: true, pointStyle: "rect" as const, font: { size: 11 }, padding: 12 },
    },
    tooltip: commonTooltip,
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 11 }, color: "#9ca3af" }, stacked },
    y: {
      grid: { color: "#f0f0f0" },
      ticks: {
        font: { size: 11 },
        color: "#9ca3af",
        callback: (v: number | string) => fmtNumber(Number(v)),
      },
      stacked,
      title: { display: true, text: "Lines of code", font: { size: 11 }, color: "#9ca3af" },
    },
  },
});

/* ── Component ── */

export default function CodeGenerationPage() {
  const [data, setData] = useState<CodeGenData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (filters: FilterState) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.set("start", filters.startDate);
      if (filters.endDate) params.set("end", filters.endDate);
      if (filters.userId) params.set("userId", filters.userId);
      const res = await fetch(`/api/metrics/code-generation?${params}`);
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("Failed to fetch code generation data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Chart builders ── */

  const dailyChart = useMemo(() => {
    if (!data) return null;
    return {
      labels: data.dailyTotals.map((d) => fmtDate(d.date)),
      datasets: [
        {
          label: "Added",
          data: data.dailyTotals.map((d) => Number(d.added)),
          backgroundColor: COLOR.added,
          borderRadius: 2,
        },
        {
          label: "Deleted",
          data: data.dailyTotals.map((d) => Number(d.deleted)),
          backgroundColor: COLOR.deleted,
          borderRadius: 2,
        },
      ],
    };
  }, [data]);

  const userByFeatureChart = useMemo(() => {
    if (!data || !data.userInitiatedByFeature.length) return null;
    return {
      labels: data.userInitiatedByFeature.map((d) => d.feature),
      datasets: [
        {
          label: "Suggested",
          data: data.userInitiatedByFeature.map((d) => d.suggested),
          backgroundColor: COLOR.suggested,
          borderRadius: 3,
        },
        {
          label: "Added",
          data: data.userInitiatedByFeature.map((d) => d.added),
          backgroundColor: COLOR.userAdded,
          borderRadius: 3,
        },
      ],
    };
  }, [data]);

  const agentByFeatureChart = useMemo(() => {
    if (!data || !data.agentInitiatedByFeature.length) return null;
    return {
      labels: data.agentInitiatedByFeature.map((d) => d.feature),
      datasets: [
        {
          label: "Added",
          data: data.agentInitiatedByFeature.map((d) => d.added),
          backgroundColor: COLOR.added,
          borderRadius: 3,
        },
        {
          label: "Deleted",
          data: data.agentInitiatedByFeature.map((d) => d.deleted),
          backgroundColor: COLOR.deleted,
          borderRadius: 3,
        },
      ],
    };
  }, [data]);

  const userByModelChart = useMemo(() => {
    if (!data || !data.userInitiatedByModel.length) return null;
    return {
      labels: data.userInitiatedByModel.map((d) => d.model),
      datasets: [
        {
          label: "Suggested",
          data: data.userInitiatedByModel.map((d) => d.suggested),
          backgroundColor: COLOR.suggested,
          borderRadius: 3,
        },
        {
          label: "Added",
          data: data.userInitiatedByModel.map((d) => d.added),
          backgroundColor: COLOR.userAdded,
          borderRadius: 3,
        },
      ],
    };
  }, [data]);

  const agentByModelChart = useMemo(() => {
    if (!data || !data.agentInitiatedByModel.length) return null;
    return {
      labels: data.agentInitiatedByModel.map((d) => d.model),
      datasets: [
        {
          label: "Added",
          data: data.agentInitiatedByModel.map((d) => d.added),
          backgroundColor: COLOR.added,
          borderRadius: 3,
        },
        {
          label: "Deleted",
          data: data.agentInitiatedByModel.map((d) => d.deleted),
          backgroundColor: COLOR.deleted,
          borderRadius: 3,
        },
      ],
    };
  }, [data]);

  const userByLangChart = useMemo(() => {
    if (!data || !data.userInitiatedByLanguage.length) return null;
    return {
      labels: data.userInitiatedByLanguage.map((d) => d.language),
      datasets: [
        {
          label: "Suggested",
          data: data.userInitiatedByLanguage.map((d) => d.suggested),
          backgroundColor: COLOR.suggested,
          borderRadius: 3,
        },
        {
          label: "Added",
          data: data.userInitiatedByLanguage.map((d) => d.added),
          backgroundColor: COLOR.userAdded,
          borderRadius: 3,
        },
      ],
    };
  }, [data]);

  const agentByLangChart = useMemo(() => {
    if (!data || !data.agentInitiatedByLanguage.length) return null;
    return {
      labels: data.agentInitiatedByLanguage.map((d) => d.language),
      datasets: [
        {
          label: "Added",
          data: data.agentInitiatedByLanguage.map((d) => d.added),
          backgroundColor: COLOR.added,
          borderRadius: 3,
        },
        {
          label: "Deleted",
          data: data.agentInitiatedByLanguage.map((d) => d.deleted),
          backgroundColor: COLOR.deleted,
          borderRadius: 3,
        },
      ],
    };
  }, [data]);

  return (
    <div className="space-y-6">
      {/* ── Header + Filters ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">IDE Code Generation</h1>
          <p className="text-sm text-gray-500">
            Lines of code added and deleted from the codebase across all modes
          </p>
        </div>
        <ReportFilters onApply={fetchData} />
      </div>
      <DataSourceBanner />

      {loading && !data ? (
        <div className="flex h-64 items-center justify-center text-sm text-gray-400">Loading...</div>
      ) : data ? (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Kpi
              label="Lines of code changed with AI"
              value={fmtNumber(data.kpis.totalLocChanged)}
              sub={`Lines of code added and deleted across all modes in the last ${data.period.days} days`}
            />
            <Kpi
              label="Agent Contribution"
              value={`${data.kpis.agentContribution}%`}
              sub={`Percentage of lines of code added and deleted by agents in the last ${data.period.days} days`}
            />
            <Kpi
              label="Average lines deleted by agent"
              value={fmtNumber(data.kpis.avgLinesDeletedByAgent)}
              sub="Average lines of code deleted by agents on behalf of active users in the current calendar month"
            />
          </div>

          {/* ── Daily Total ── */}
          <Card
            title="Daily total of lines added and deleted"
            subtitle="Total lines of code added to and deleted from the codebase across all modes"
          >
            {dailyChart && (
              <div className="h-[320px]">
                <Bar data={dailyChart} options={barOpts(false) as object} />
              </div>
            )}
          </Card>

          {/* ── User vs Agent by Feature ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card
              title="User-initiated code changes"
              subtitle="Compares the total lines of code suggested and manually added by users through code completions and chat panel actions (insert, copy, and apply)"
            >
              {userByFeatureChart ? (
                <div className="h-[280px]">
                  <Bar data={userByFeatureChart} options={barOpts(false) as object} />
                </div>
              ) : (
                <Empty />
              )}
            </Card>
            <Card
              title="Agent-initiated code changes"
              subtitle="Compares the total lines of code automatically added to and deleted from the codebase by agents on behalf of users, combining edit, agent, and custom modes"
            >
              {agentByFeatureChart ? (
                <div className="h-[280px]">
                  <Bar data={agentByFeatureChart} options={barOpts(false) as object} />
                </div>
              ) : (
                <Empty />
              )}
            </Card>
          </div>

          {/* ── User vs Agent by Model ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card
              title="User-initiated code changes per model"
              subtitle="Compares the total lines of code suggested and manually added by users, grouped by model used"
            >
              {userByModelChart ? (
                <div className="h-[280px]">
                  <Bar data={userByModelChart} options={barOpts(false) as object} />
                </div>
              ) : (
                <Empty />
              )}
            </Card>
            <Card
              title="Agent-initiated code changes per model"
              subtitle="Compares the total lines of code added and deleted by agents on behalf of users, grouped by model used"
            >
              {agentByModelChart ? (
                <div className="h-[280px]">
                  <Bar data={agentByModelChart} options={barOpts(false) as object} />
                </div>
              ) : (
                <Empty />
              )}
            </Card>
          </div>

          {/* ── User vs Agent by Language ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card
              title="User-initiated code changes per language"
              subtitle="Compares the total lines of code suggested and manually added by users, grouped by language used"
            >
              {userByLangChart ? (
                <div className="h-[280px]">
                  <Bar data={userByLangChart} options={barOpts(false) as object} />
                </div>
              ) : (
                <Empty />
              )}
            </Card>
            <Card
              title="Agent-initiated code changes per language"
              subtitle="Compares the total lines of code added and deleted by agents on behalf of users, grouped by language used"
            >
              {agentByLangChart ? (
                <div className="h-[280px]">
                  <Bar data={agentByLangChart} options={barOpts(false) as object} />
                </div>
              ) : (
                <Empty />
              )}
            </Card>
          </div>
        </>
      ) : null}
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

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-gray-400 leading-tight">{sub}</p>}
    </div>
  );
}

function Empty() {
  return <p className="py-8 text-center text-sm text-gray-400">No data available for the selected period</p>;
}
