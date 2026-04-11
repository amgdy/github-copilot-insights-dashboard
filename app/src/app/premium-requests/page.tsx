"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import { useChartOptions } from "@/lib/theme/chart-theme";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { DataTable } from "@/components/ui/data-table";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { usePdfExport } from "@/components/ui/pdf-export";
import { ConfigurationBanner } from "@/components/layout/configuration-banner";
import { AlertTriangle, Settings } from "lucide-react";
import Link from "next/link";

ChartJS.register(
  CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend
);

/* ── Types ── */

interface PremiumTotals {
  totalPremiumRequests: number;
  includedQuota: number;
  includedUsed: number;
  overage: number;
  grossAmount: number;
  netAmount: number;
}

interface ModelBreakdown {
  sku: string;
  grossQuantity: number;
  grossAmount: number;
  netAmount: number;
}

interface UserBreakdown {
  user: string;
  displayLabel: string;
  grossQuantity: number;
  grossAmount: number;
  netAmount: number;
}

interface OrgBreakdown {
  org: string;
  grossQuantity: number;
  grossAmount: number;
  netAmount: number;
}

interface PremiumData {
  period: { year: number; month: number };
  totals: PremiumTotals;
  seats: { total: number; planCounts: Record<string, number> };
  perModelBreakdown: ModelBreakdown[];
  perUserBreakdown: UserBreakdown[];
  perOrgBreakdown: OrgBreakdown[];
}

/* ── Helpers ── */

function fmt$(v: number) {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(v: number) {
  return v.toLocaleString("en-US");
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* ── Chart config ── */

// tooltipStyle moved to component via useChartOptions

// doughnutOpts moved to component via useChartOptions

// barOpts moved to component via useChartOptions

const MODEL_COLORS = [
  "#8b5cf6", "#a855f7", "#c084fc", "#d8b4fe", "#7c3aed",
  "#6d28d9", "#5b21b6", "#4c1d95", "#ec4899", "#f43f5e",
  "#3b82f6", "#6366f1", "#14b8a6", "#f59e0b", "#10b981",
];

/* ── Component ── */

export default function PremiumRequestsPage() {
  const { commonOptions: barOpts, doughnutOptions: doughnutOpts } = useChartOptions();
  const { t } = useTranslation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<PremiumData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { ref: reportRef, ExportButton: PdfButton } = usePdfExport("copilot-premium-requests");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/metrics/premium-requests?year=${year}&month=${month}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((d: PremiumData) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [year, month]);

  /* Chart data */

  const includedVsOverageDonut = useMemo(() => {
    if (!data) return null;
    const { includedUsed, overage, includedQuota } = data.totals;
    const remaining = Math.max(0, includedQuota - includedUsed);
    return {
      labels: ["Included (Used)", "Included (Remaining)", "Overage (Paid)"],
      datasets: [{
        data: [includedUsed, remaining, overage],
        backgroundColor: ["#22c55e", "#d1fae5", "#ef4444"],
        borderWidth: 0,
      }],
    };
  }, [data]);

  const modelBar = useMemo(() => {
    if (!data || data.perModelBreakdown.length === 0) return null;
    const top = data.perModelBreakdown.slice(0, 15);
    return {
      labels: top.map((m) => m.sku),
      datasets: [{
        label: "Premium Requests",
        data: top.map((m) => m.grossQuantity),
        backgroundColor: top.map((_, i) => MODEL_COLORS[i % MODEL_COLORS.length]),
        borderRadius: 6,
      }],
    };
  }, [data]);

  const orgBar = useMemo(() => {
    if (!data || data.perOrgBreakdown.length === 0) return null;
    const sorted = [...data.perOrgBreakdown].sort((a, b) => a.org.localeCompare(b.org));
    return {
      labels: sorted.map((o) => o.org),
      datasets: [{
        label: "Premium Requests",
        data: sorted.map((o) => o.grossQuantity),
        backgroundColor: "#6366f1",
        borderRadius: 6,
      }],
    };
  }, [data]);

  /* Month navigation */
  const goMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setYear(y);
    setMonth(m);
  };

  /* Render */

  if (loading) {
    return <LoadingSpinner message={t("premiumRequests.loadingPremium")} />;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <ConfigurationBanner />
        <div className="flex flex-col items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-6 py-16 text-center dark:border-amber-800 dark:bg-amber-950/40">
          <div className="mb-4 rounded-full bg-amber-100 p-4 dark:bg-amber-900/50">
            <AlertTriangle className="h-8 w-8 text-amber-500 dark:text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t("common.apiError")}
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-sm text-gray-600 dark:text-gray-400">
            {error}
          </p>
          <Link
            href="/settings"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition-colors hover:bg-blue-700"
          >
            <Settings className="h-4 w-4" />
            {t("configBanner.goToSettings")}
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { totals } = data;
  const utilizationPct = totals.includedQuota > 0
    ? Math.round((totals.totalPremiumRequests / totals.includedQuota) * 100)
    : 0;

  return (
    <div ref={reportRef} className="space-y-6">
      <ConfigurationBanner />
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Breadcrumb items={[{ label: "Premium Requests", href: "/premium-requests" }]} />
          <h1 className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{t("premiumRequests.title")}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("premiumRequests.subtitle")}
          </p>
        </div>
        <PdfButton />
      </div>

      {/* Month Selector */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => goMonth(-1)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          ← Prev
        </button>
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button
          onClick={() => goMonth(1)}
          disabled={year === now.getFullYear() && month === now.getMonth() + 1}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Next →
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label={t("premiumRequests.totalPremiumRequests")} value={fmtNum(totals.totalPremiumRequests)} />
        <Kpi label={t("premiumRequests.includedQuota")} value={fmtNum(totals.includedQuota)} color="text-green-600" />
        <Kpi label={t("premiumRequests.includedUsed")} value={fmtNum(totals.includedUsed)} color="text-green-600" />
        <Kpi label={t("premiumRequests.overagePaid")} value={fmtNum(totals.overage)} color={totals.overage > 0 ? "text-red-600" : "text-gray-900"} />
        <Kpi label={t("premiumRequests.utilizationLabel")} value={`${utilizationPct}%`} color={utilizationPct > 100 ? "text-red-600" : utilizationPct > 80 ? "text-amber-600" : "text-green-600"} />
        <Kpi label={t("premiumRequests.overageCost")} value={fmt$(totals.netAmount)} color={totals.netAmount > 0 ? "text-red-600" : "text-gray-900"} />
      </div>

      {/* Overage Warning */}
      {totals.overage > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/30">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-red-900 dark:text-red-100">Overage Detected</h3>
              <p className="text-sm text-red-700 dark:text-red-300">
                {fmtNum(totals.overage)} premium requests exceeded the included quota of {fmtNum(totals.includedQuota)}.
                Overage requests are billed at $0.04 per request.
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-red-900 dark:text-red-100">{fmt$(totals.netAmount)}</p>
              <p className="text-xs text-red-600 dark:text-red-400">overage cost</p>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={t("premiumRequests.includedVsOverage")} subtitle={t("premiumRequests.includedVsOverageDesc")}>
          {includedVsOverageDonut && (
            <div className="h-[280px]"><Doughnut data={includedVsOverageDonut} options={doughnutOpts} /></div>
          )}
        </Card>
        <Card title={t("premiumRequests.byModel")} subtitle={t("premiumRequests.byModelDesc")}>
          {modelBar ? (
            <div className="h-[280px]"><Bar data={modelBar} options={barOpts} /></div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">No model-level data available</p>
          )}
        </Card>
      </div>

      {orgBar && (
        <Card title={t("premiumRequests.byOrganization")} subtitle={t("premiumRequests.byOrganizationDesc")}>
          <div className="h-[280px]"><Bar data={orgBar} options={barOpts} /></div>
        </Card>
      )}

      {/* Quota Breakdown */}
      <Card title={t("premiumRequests.quotaAllocation")} subtitle={t("premiumRequests.quotaAllocationDesc")}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <th className="pb-2 pr-4">Plan</th>
                <th className="pb-2 pr-4 text-right">Seats</th>
                <th className="pb-2 pr-4 text-right">Quota / Seat</th>
                <th className="pb-2 text-right">Total Quota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {Object.entries(data.seats.planCounts).map(([plan, count]) => (
                <tr key={plan} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="py-2 pr-4 font-medium text-gray-900 capitalize dark:text-gray-100">{plan}</td>
                  <td className="py-2 pr-4 text-right text-gray-700 dark:text-gray-300">{fmtNum(count)}</td>
                  <td className="py-2 pr-4 text-right text-gray-700 dark:text-gray-300">{fmtNum(PLAN_QUOTAS[plan] ?? 0)}</td>
                  <td className="py-2 text-right font-medium text-gray-900 dark:text-gray-100">{fmtNum((PLAN_QUOTAS[plan] ?? 0) * count)}</td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-2 pr-4 text-gray-900 dark:text-gray-100">Total</td>
                <td className="py-2 pr-4 text-right text-gray-700 dark:text-gray-300">{fmtNum(data.seats.total)}</td>
                <td className="py-2 pr-4 text-right text-gray-500 dark:text-gray-400">—</td>
                <td className="py-2 text-right text-green-700 dark:text-green-400">{fmtNum(totals.includedQuota)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Model Breakdown Table */}
      {data.perModelBreakdown.length > 0 && (
        <Card title={t("premiumRequests.modelBreakdown")} subtitle={t("premiumRequests.modelBreakdownDesc")}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  <th className="pb-2 pr-4">Model</th>
                  <th className="pb-2 pr-4 text-right">Requests</th>
                  <th className="pb-2 pr-4 text-right">Gross Amount</th>
                  <th className="pb-2 text-right">Net Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {data.perModelBreakdown.map((m) => (
                  <tr key={m.sku} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="py-2 pr-4 font-medium text-gray-900 dark:text-gray-100">{m.sku}</td>
                    <td className="py-2 pr-4 text-right text-gray-700 dark:text-gray-300">{fmtNum(m.grossQuantity)}</td>
                    <td className="py-2 pr-4 text-right text-gray-700 dark:text-gray-300">{fmt$(m.grossAmount)}</td>
                    <td className="py-2 text-right font-medium text-gray-900 dark:text-gray-100">{fmt$(m.netAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Per-User Table */}
      {data.perUserBreakdown.length > 0 && (
        <Card title={`User breakdown (${data.perUserBreakdown.length})`} subtitle="Premium request consumption per user">
          <DataTable
            columns={[
              { key: "displayLabel", header: "User", render: (value: unknown) => <span className="font-medium text-gray-900 dark:text-gray-100">{String(value)}</span> },
              { key: "grossQuantity", header: "Requests", align: "right", render: (value: unknown) => fmtNum(Number(value)) },
              { key: "grossAmount", header: "Gross Amount", align: "right", render: (value: unknown) => fmt$(Number(value)) },
              { key: "netAmount", header: "Net Amount", align: "right", render: (value: unknown) => <span className="font-medium text-gray-900 dark:text-gray-100">{fmt$(Number(value))}</span> },
            ]}
            data={(data.perUserBreakdown) as unknown as Record<string, unknown>[]}
            emptyMessage={t("premiumRequests.noUserData")}
            searchPlaceholder={t("common.searchUsersEllipsis")}
            pageSize={25}
            defaultSortKey="grossQuantity"
            defaultSortDir="desc"
          />
        </Card>
      )}

      {/* Info Note */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300">
        <p className="font-medium">About premium request billing</p>
        <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">
          Each Copilot Business seat includes 300 premium requests/month and each Enterprise seat includes 1,000.
          Usage beyond the included quota is billed at $0.04 per request.
          Data is sourced from the GitHub Enterprise Billing API.
        </p>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

const PLAN_QUOTAS: Record<string, number> = {
  business: 300,
  enterprise: 1000,
};

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

function Kpi({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color ?? "text-gray-900 dark:text-gray-100"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
