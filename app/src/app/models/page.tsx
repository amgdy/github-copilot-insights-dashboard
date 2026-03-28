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
import { DataSourceBanner } from "@/components/layout/report-filters";

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

const barOpts = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: "y" as const,
  plugins: {
    legend: { display: false },
    tooltip: tooltipStyle,
  },
  scales: {
    x: { grid: { color: "#f0f0f0" }, ticks: { font: { size: 11 }, color: "#9ca3af" } },
    y: { grid: { display: false }, ticks: { font: { size: 11 }, color: "#374151" } },
  },
};

const FEATURE_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981",
  "#6366f1", "#ef4444", "#14b8a6", "#f97316", "#84cc16",
];

/* ── Component ── */

export default function ModelsPage() {
  const [data, setData] = useState<ModelsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | "premium" | "included">("all");
  const [enabledFilter, setEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");

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
      if (enabledFilter === "enabled" && !m.isEnabled) return false;
      if (enabledFilter === "disabled" && m.isEnabled) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          m.modelName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, search, tierFilter, enabledFilter]);

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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl py-10 text-center">
        <p className="text-red-600">Error: {error}</p>
      </div>
    );
  }

  if (!data) return null;

  const premiumCount = data.models.filter((m) => m.isPremium).length;
  const enabledCount = data.models.filter((m) => m.isEnabled).length;
  const activeModels = data.models.filter((m) => m.usage && m.usage.totalRequests > 0).length;
  const totalRequests = data.models.reduce((s, m) => s + (m.usage?.totalRequests ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Breadcrumb items={[{ label: "Models", href: "/models" }]} />
        <h1 className="mt-1 text-xl font-bold text-gray-900">GitHub Copilot Models</h1>
        <p className="text-sm text-gray-500">
          Available Copilot models and their enablement status.
          Usage data from the last {data.period.days} days.
        </p>
      </div>
      <DataSourceBanner />

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {[
          { label: "Total Models", value: data.models.length, color: "text-blue-600" },
          { label: "Enabled", value: enabledCount, color: "text-green-600" },
          { label: "Premium Models", value: premiumCount, color: "text-purple-600" },
          { label: "Active Models", value: activeModels, sub: `(${data.period.days}d)`, color: "text-indigo-600" },
          { label: "Total Requests", value: totalRequests.toLocaleString(), sub: `(${data.period.days}d)`, color: "text-gray-900" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">{kpi.label}</p>
            <p className={`text-2xl font-bold ${kpi.color}`}>
              {kpi.value}
              {kpi.sub && <span className="ml-1 text-xs font-normal text-gray-400">{kpi.sub}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* ── Charts ── */}
      {usageBar && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Requests by Model</h3>
          <div className="h-64"><Bar data={usageBar} options={barOpts} /></div>
        </div>
      )}

      {featureBar && Object.keys(data.models[0]?.featureBreakdown ?? {}).length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Requests by Feature (All Models)</h3>
          <div className="h-48">
            <Bar
              data={featureBar}
              options={{
                ...barOpts,
                indexAxis: "x" as const,
                scales: {
                  x: { grid: { display: false }, ticks: { font: { size: 11 }, color: "#9ca3af" } },
                  y: { grid: { color: "#f0f0f0" }, ticks: { font: { size: 11 }, color: "#9ca3af" } },
                },
              }}
            />
          </div>
        </div>
      )}

      {/* ── Models Table ── */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900">All Models</h2>
          <div className="flex gap-2">
            <select
              value={enabledFilter}
              onChange={(e) => setEnabledFilter(e.target.value as typeof enabledFilter)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="all">All Status</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value as typeof tierFilter)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="all">All Tiers</option>
              <option value="premium">Premium</option>
              <option value="included">Included</option>
            </select>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models…"
              className="w-48 rounded-md border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500">
                <th className="pb-2 pr-4 font-medium">Model</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
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
                  <td colSpan={9} className="py-8 text-center text-gray-400">
                    No models found.
                  </td>
                </tr>
              ) : (
                filteredModels.map((m) => (
                  <tr key={m.modelName} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2.5 pr-4">
                      <p className="font-medium text-gray-900">{m.modelName}</p>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          m.isEnabled
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {m.isEnabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          m.isPremium
                            ? "bg-purple-100 text-purple-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {m.tier}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-gray-700">
                      {m.usage ? m.usage.totalRequests.toLocaleString() : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-gray-700">
                      {m.usage ? m.usage.uniqueUsers : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-gray-700">
                      {m.usage ? m.usage.activeDays : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-gray-500">
                      {m.usage?.firstSeen ?? "—"}
                    </td>
                    <td className="py-2.5 text-xs text-gray-500">
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

      {/* ── Info Note ── */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-medium">About model enablement</p>
        <p className="mt-1 text-xs text-blue-700">
          Model enablement status reflects the enterprise AI Controls configuration. GitHub does not currently
          provide a REST API for model enablement — the status shown here is maintained from seed data and may
          need manual updates via the database when the enterprise admin changes model availability.
        </p>
      </div>
    </div>
  );
}
