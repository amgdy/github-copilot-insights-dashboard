"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { DataSourceBanner, formatDateRangeLabel } from "@/components/layout/report-filters";
import { useChartOptions } from "@/lib/theme/chart-theme";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { ConfigurationBanner } from "@/components/layout/configuration-banner";
import { EmptyState } from "@/components/ui/empty-state";
import type { DataRange } from "@/components/layout/report-filters";

ChartJS.register(
  CategoryScale, LinearScale, BarElement, Tooltip, Legend
);

/* ── Types ── */

interface ModelUsage {
  totalInteractions: number;
  totalCodeGen: number;
  totalRequests: number;
  uniqueUsers: number;
  activeDays: number;
  firstSeen: string;
  lastSeen: string;
}

interface ModelInfo {
  modelName: string;
  isPremium: boolean;
  isEnabled: boolean;
  tier: string;
  createdAt: string;
  usage: ModelUsage | null;
  featureBreakdown: Record<string, number>;
}

interface ModelsData {
  period: { start: string; end: string; days: number };
  models: ModelInfo[];
}

/* ── Chart helpers ── */

// tooltipStyle and barOpts moved to component via useChartOptions

const FEATURE_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981",
  "#6366f1", "#ef4444", "#14b8a6", "#f97316", "#84cc16",
];

/* ── Component ── */

export default function ModelsPage() {
  const { commonOptions, isDark } = useChartOptions();
  const { t } = useTranslation();
  const barOpts = {
    ...commonOptions,
    indexAxis: "y" as const,
    scales: {
      x: { ...commonOptions.scales.y },
      y: { ...commonOptions.scales.x, ticks: { ...commonOptions.scales.x.ticks, color: isDark ? "#cbd5e1" : "#374151" } },
    },
  };
  const [data, setData] = useState<ModelsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | "premium" | "included">("all");
  const [dataRange, setDataRange] = useState<DataRange | null>(null);

  useEffect(() => {
    fetch("/api/data-range").then(r => r.ok ? r.json() : null).then(d => { if (d) setDataRange(d); }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/metrics/models?days=28")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
        return res.json();
      })
      .then((d: ModelsData) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredModels = useMemo(() => {
    if (!data) return [];
    return data.models.filter((m) => {
      if (tierFilter !== "all" && m.tier !== tierFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          m.modelName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, search, tierFilter]);

  const usageBar = useMemo(() => {
    if (!data) return null;
    const sorted = [...data.models]
      .filter((m) => m.usage && m.usage.totalRequests > 0)
      .sort((a, b) => (b.usage?.totalRequests ?? 0) - (a.usage?.totalRequests ?? 0))
      .slice(0, 15);
    return {
      labels: sorted.map((m) => m.modelName),
      datasets: [{
        label: "Total Requests",
        data: sorted.map((m) => m.usage?.totalRequests ?? 0),
        backgroundColor: sorted.map((m) =>
          m.isPremium ? "#8b5cf6" : "#22c55e"
        ),
        borderRadius: 4,
      }],
    };
  }, [data]);

  const featureBar = useMemo(() => {
    if (!data) return null;
    // Aggregate feature usage across all models
    const featureTotals: Record<string, number> = {};
    for (const m of data.models) {
      for (const [feat, count] of Object.entries(m.featureBreakdown)) {
        featureTotals[feat] = (featureTotals[feat] ?? 0) + count;
      }
    }
    const sorted = Object.entries(featureTotals).sort((a, b) => b[1] - a[1]);
    return {
      labels: sorted.map(([f]) => f),
      datasets: [{
        label: "Requests",
        data: sorted.map(([, v]) => v),
        backgroundColor: sorted.map((_, i) => FEATURE_COLORS[i % FEATURE_COLORS.length]),
        borderRadius: 4,
      }],
    };
  }, [data]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600 dark:border-gray-700 dark:border-t-blue-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <ConfigurationBanner />
        <EmptyState hasData={!!dataRange?.lastSyncAt} />
      </div>
    );
  }

  if (!data) return null;

  const premiumCount = data.models.filter((m) => m.isPremium).length;
  const activeModels = data.models.filter((m) => m.usage && m.usage.totalRequests > 0).length;
  const totalRequests = data.models.reduce((s, m) => s + (m.usage?.totalRequests ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <ConfigurationBanner />
      <div>
        <Breadcrumb items={[{ label: "Models", href: "/models" }]} />
        <h1 className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{t("models.title")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Available Copilot models and their enablement status.
          Usage data: {formatDateRangeLabel(data.period.start, data.period.end)}.
        </p>
      </div>
      <DataSourceBanner />

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Models", value: data.models.length, color: "text-blue-600" },
          { label: "Premium Models", value: premiumCount, color: "text-purple-600" },
          { label: "Active Models", value: activeModels, color: "text-indigo-600" },
          { label: "Total Requests", value: totalRequests.toLocaleString(), color: "text-gray-900 dark:text-gray-100" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">{kpi.label}</p>
            <p className={`text-2xl font-bold ${kpi.color}`}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Charts ── */}
      {usageBar && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Requests by Model</h3>
          <div className="h-64"><Bar data={usageBar} options={barOpts} /></div>
        </div>
      )}

      {featureBar && Object.keys(data.models[0]?.featureBreakdown ?? {}).length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Requests by Feature (All Models)</h3>
          <div className="h-48">
            <Bar
              data={featureBar}
              options={{
                ...commonOptions,
                indexAxis: "x" as const,
              }}
            />
          </div>
        </div>
      )}

      {/* ── Models Table ── */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">All Models</h2>
          <div className="flex gap-2">
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value as typeof tierFilter)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-hidden dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              <option value="all">All Tiers</option>
              <option value="premium">Premium</option>
              <option value="included">Included</option>
            </select>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("models.searchModels")}
              className="w-48 rounded-md border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <th className="pb-2 pr-4 font-medium">Model</th>
                <th className="pb-2 pr-4 font-medium">Tier</th>
                <th className="pb-2 pr-4 font-medium text-right">Requests</th>
                <th className="pb-2 pr-4 font-medium text-right">Users</th>
                <th className="pb-2 pr-4 font-medium text-right">Active Days</th>
                <th className="pb-2 pr-4 font-medium">First Seen</th>
                <th className="pb-2 font-medium">Last Seen</th>
                <th className="pb-2 font-medium">Features</th>
              </tr>
            </thead>
            <tbody>
              {filteredModels.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400 dark:text-gray-500">
                    No models found.
                  </td>
                </tr>
              ) : (
                filteredModels.map((m) => (
                  <tr key={m.modelName} className="border-b border-gray-50 hover:bg-gray-50/50 dark:border-gray-700 dark:hover:bg-gray-700/50">
                    <td className="py-2.5 pr-4">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{m.modelName}</p>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          m.isPremium
                            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                            : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        }`}
                      >
                        {m.tier}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      {m.usage ? m.usage.totalRequests.toLocaleString() : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      {m.usage ? m.usage.uniqueUsers : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      {m.usage ? m.usage.activeDays : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-gray-500 dark:text-gray-400">
                      {m.usage?.firstSeen ?? "—"}
                    </td>
                    <td className="py-2.5 text-xs text-gray-500 dark:text-gray-400">
                      {m.usage?.lastSeen ?? "—"}
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(m.featureBreakdown).length > 0
                          ? Object.entries(m.featureBreakdown)
                              .sort((a, b) => b[1] - a[1])
                              .slice(0, 3)
                              .map(([feat, count]) => (
                                <span
                                  key={feat}
                                  className="inline-flex rounded-sm bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600"
                                  title={`${feat}: ${count.toLocaleString()} requests`}
                                >
                                  {feat}
                                </span>
                              ))
                          : <span className="text-[10px] text-gray-400">—</span>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>


    </div>
  );
}
