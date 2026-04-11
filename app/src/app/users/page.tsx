"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { DataTable } from "@/components/ui/data-table";
import { usePdfExport } from "@/components/ui/pdf-export";
import { useTranslation } from "@/lib/i18n/locale-provider";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { DataSourceBanner } from "@/components/layout/report-filters";
import type { DataRange } from "@/components/layout/report-filters";
import { ChevronDown, ChevronUp, Filter } from "lucide-react";
import { ConfigurationBanner } from "@/components/layout/configuration-banner";
import { EmptyState } from "@/components/ui/empty-state";

interface UserRow {
  userId: number;
  userLogin: string;
  displayLabel: string;
  daysActive: number;
  totalInteractions: number;
  avgInteractionsPerDay: number;
  acceptanceRate: number;
  usedAgent: boolean;
  usedChat: boolean;
  usedCli: boolean;
  lastActiveDate: string;
}

interface LicensedUser {
  login: string;
  displayName: string | null;
  effectivePlan: string;
  assignmentCount: number;
  lastActivityAt: string | null;
  lastEditor: string | null;
  earliestAssignment: string;
  status: string;
  monthlyCost: number;
}

interface MergedUser {
  login: string;
  displayLabel: string;
  hasLicense: boolean;
  plan: string;
  licenseStatus: string;
  daysActive: number;
  totalInteractions: number;
  acceptanceRate: number;
  usedAgent: boolean;
  usedChat: boolean;
  usedCli: boolean;
  lastActiveDate: string;
  monthlyCost: number;
}

interface AdvancedFilters {
  hasLicense: "all" | "yes" | "no";
  plan: "all" | "enterprise" | "business";
  status: "all" | "active" | "inactive" | "never_active";
  usedAgent: "all" | "yes" | "no";
  usedChat: "all" | "yes" | "no";
  usedCli: "all" | "yes" | "no";
  minDaysActive: string;
  maxDaysActive: string;
  minInteractions: string;
  maxInteractions: string;
  minAcceptanceRate: string;
  maxAcceptanceRate: string;
}

const DEFAULT_FILTERS: AdvancedFilters = {
  hasLicense: "all",
  plan: "all",
  status: "all",
  usedAgent: "all",
  usedChat: "all",
  usedCli: "all",
  minDaysActive: "",
  maxDaysActive: "",
  minInteractions: "",
  maxInteractions: "",
  minAcceptanceRate: "",
  maxAcceptanceRate: "",
};

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FilterRange({
  label,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  placeholder,
  step,
}: {
  label: string;
  minValue: string;
  maxValue: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  placeholder?: [string, string];
  step?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={minValue}
          onChange={(e) => onMinChange(e.target.value)}
          placeholder={placeholder?.[0] ?? "Min"}
          step={step}
          className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        />
        <span className="text-gray-400 dark:text-gray-500">–</span>
        <input
          type="number"
          value={maxValue}
          onChange={(e) => onMaxChange(e.target.value)}
          placeholder={placeholder?.[1] ?? "Max"}
          step={step}
          className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        />
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [licensedUsers, setLicensedUsers] = useState<LicensedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<AdvancedFilters>(DEFAULT_FILTERS);
  const [dataRange, setDataRange] = useState<DataRange | null>(null);
  const { ref: reportRef, ExportButton: PdfButton } = usePdfExport("copilot-users");
  const { t } = useTranslation();

  useEffect(() => {
    fetch("/api/data-range").then(r => r.ok ? r.json() : null).then(d => { if (d) setDataRange(d); }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      try {
        const [usersRes, seatsRes] = await Promise.all([
          fetch(`/api/users?days=9999&limit=500&sortBy=interactions&sortDir=desc`),
          fetch("/api/metrics/seats"),
        ]);
        if (!cancelled) {
          if (usersRes.ok) {
            const d = await usersRes.json();
            setUsers(d.users ?? []);
          }
          if (seatsRes.ok) {
            const d = await seatsRes.json();
            setLicensedUsers(d.allUsers ?? []);
          }
        }
      } catch (err) {
        console.error("Failed to fetch user data:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  const mergedUsers = useMemo<MergedUser[]>(() => {
    const licenseMap = new Map<string, LicensedUser>();
    for (const lu of licensedUsers) {
      licenseMap.set(lu.login.toLowerCase(), lu);
    }

    const seen = new Set<string>();
    const result: MergedUser[] = [];

    // Start with activity users, enrich with license data
    for (const u of users) {
      const key = u.userLogin.toLowerCase();
      seen.add(key);
      const lic = licenseMap.get(key);
      result.push({
        login: u.userLogin,
        displayLabel: u.displayLabel,
        hasLicense: !!lic,
        plan: lic?.effectivePlan ?? "-",
        licenseStatus: lic?.status ?? "-",
        daysActive: u.daysActive,
        totalInteractions: u.totalInteractions,
        acceptanceRate: u.acceptanceRate,
        usedAgent: u.usedAgent,
        usedChat: u.usedChat,
        usedCli: u.usedCli,
        lastActiveDate: u.lastActiveDate,
        monthlyCost: lic?.monthlyCost ?? 0,
      });
    }

    // Add licensed users with no activity data
    for (const lu of licensedUsers) {
      if (!seen.has(lu.login.toLowerCase())) {
        result.push({
          login: lu.login,
          displayLabel: lu.displayName ? `${lu.displayName} (${lu.login})` : lu.login,
          hasLicense: true,
          plan: lu.effectivePlan,
          licenseStatus: lu.status,
          daysActive: 0,
          totalInteractions: 0,
          acceptanceRate: 0,
          usedAgent: false,
          usedChat: false,
          usedCli: false,
          lastActiveDate: lu.lastActivityAt
            ? new Date(lu.lastActivityAt).toISOString().split("T")[0]
            : "-",
          monthlyCost: lu.monthlyCost,
        });
      }
    }

    return result;
  }, [users, licensedUsers]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.hasLicense !== "all") count++;
    if (filters.plan !== "all") count++;
    if (filters.status !== "all") count++;
    if (filters.usedAgent !== "all") count++;
    if (filters.usedChat !== "all") count++;
    if (filters.usedCli !== "all") count++;
    if (filters.minDaysActive !== "") count++;
    if (filters.maxDaysActive !== "") count++;
    if (filters.minInteractions !== "") count++;
    if (filters.maxInteractions !== "") count++;
    if (filters.minAcceptanceRate !== "") count++;
    if (filters.maxAcceptanceRate !== "") count++;
    return count;
  }, [filters]);

  const filteredUsers = useMemo(() => {
    return mergedUsers.filter((u) => {
      if (filters.hasLicense === "yes" && !u.hasLicense) return false;
      if (filters.hasLicense === "no" && u.hasLicense) return false;
      if (filters.plan !== "all" && u.plan !== filters.plan) return false;
      if (filters.status !== "all" && u.licenseStatus !== filters.status) return false;
      if (filters.usedAgent === "yes" && !u.usedAgent) return false;
      if (filters.usedAgent === "no" && u.usedAgent) return false;
      if (filters.usedChat === "yes" && !u.usedChat) return false;
      if (filters.usedChat === "no" && u.usedChat) return false;
      if (filters.usedCli === "yes" && !u.usedCli) return false;
      if (filters.usedCli === "no" && u.usedCli) return false;
      if (filters.minDaysActive !== "" && u.daysActive < Number(filters.minDaysActive)) return false;
      if (filters.maxDaysActive !== "" && u.daysActive > Number(filters.maxDaysActive)) return false;
      if (filters.minInteractions !== "" && u.totalInteractions < Number(filters.minInteractions)) return false;
      if (filters.maxInteractions !== "" && u.totalInteractions > Number(filters.maxInteractions)) return false;
      if (filters.minAcceptanceRate !== "" && u.acceptanceRate < Number(filters.minAcceptanceRate)) return false;
      if (filters.maxAcceptanceRate !== "" && u.acceptanceRate > Number(filters.maxAcceptanceRate)) return false;
      return true;
    });
  }, [mergedUsers, filters]);

  const updateFilter = useCallback(<K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const stats = useMemo(() => {
    const total = mergedUsers.length;
    const licensed = mergedUsers.filter((u) => u.hasLicense).length;
    const active = mergedUsers.filter((u) => u.daysActive > 0).length;
    return { total, licensed, active };
  }, [mergedUsers]);

  const columns = [
    {
      key: "displayLabel" as const,
      header: "User",
      render: (value: unknown, row: unknown) => {
        const r = row as MergedUser;
        return (
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-gray-100">{String(value)}</span>
            {r.plan !== "-" && (
              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                r.plan === "enterprise" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              }`}>
                {r.plan}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "hasLicense" as const,
      header: "License",
      align: "center" as const,
      render: (value: unknown) =>
        value ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            Licensed
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            No License
          </span>
        ),
    },
    {
      key: "licenseStatus" as const,
      header: "Status",
      render: (value: unknown) => {
        const s = String(value);
        if (s === "-") return <span className="text-gray-400 dark:text-gray-500">-</span>;
        const color = s === "active" ? "text-green-600 dark:text-green-400" : s === "inactive" ? "text-amber-600 dark:text-amber-400" : "text-gray-400 dark:text-gray-500";
        const label = s === "never_active" ? "Never Active" : s.charAt(0).toUpperCase() + s.slice(1);
        return <span className={`font-medium ${color}`}>{label}</span>;
      },
    },
    {
      key: "daysActive" as const,
      header: "Days Active",
      align: "right" as const,
      render: (value: unknown) => {
        const n = Number(value);
        return n > 0 ? n : <span className="text-gray-400 dark:text-gray-500">0</span>;
      },
    },
    {
      key: "totalInteractions" as const,
      header: "Interactions",
      align: "right" as const,
      render: (value: unknown) => {
        const n = Number(value);
        return n > 0 ? n.toLocaleString() : <span className="text-gray-400 dark:text-gray-500">0</span>;
      },
    },
    {
      key: "acceptanceRate" as const,
      header: "Accept %",
      align: "right" as const,
      render: (value: unknown) => {
        const n = Number(value);
        return n > 0 ? `${n.toFixed(1)}%` : <span className="text-gray-400 dark:text-gray-500">-</span>;
      },
    },
    {
      key: "usedAgent" as const,
      header: "Agent",
      align: "center" as const,
      render: (value: unknown) =>
        value ? <span className="text-green-600 dark:text-green-400">Yes</span> : <span className="text-gray-400 dark:text-gray-500">-</span>,
    },
    {
      key: "usedChat" as const,
      header: "Chat",
      align: "center" as const,
      render: (value: unknown) =>
        value ? <span className="text-green-600 dark:text-green-400">Yes</span> : <span className="text-gray-400 dark:text-gray-500">-</span>,
    },
    {
      key: "usedCli" as const,
      header: "CLI",
      align: "center" as const,
      render: (value: unknown) =>
        value ? <span className="text-green-600 dark:text-green-400">Yes</span> : <span className="text-gray-400 dark:text-gray-500">-</span>,
    },
    {
      key: "lastActiveDate" as const,
      header: "Last Active",
      render: (value: unknown) => {
        const s = String(value);
        return s === "-" ? <span className="text-gray-400 dark:text-gray-500">Never</span> : s;
      },
    },
    {
      key: "monthlyCost" as const,
      header: "Cost/mo",
      align: "right" as const,
      render: (value: unknown) => {
        const n = Number(value);
        return n > 0 ? `$${n.toFixed(0)}` : <span className="text-gray-400 dark:text-gray-500">-</span>;
      },
    },
  ];

  return (
    <div ref={reportRef} className="space-y-6">
      <ConfigurationBanner />
      <div className="flex items-start justify-between">
        <div>
          <Breadcrumb items={[{ label: "Users", href: "/users" }]} />
          <h1 className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{t("users.title")}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("users.subtitle")}
          </p>
        </div>
        <PdfButton />
      </div>
      <DataSourceBanner sourceLabel="Synced usage data + live GitHub license API" />

      {loading ? (
        <LoadingSpinner message={t("users.loadingUsers")} />
      ) : mergedUsers.length === 0 ? (
        <EmptyState hasData={!!dataRange?.lastSyncAt} />
      ) : (
        <>
      {/* Stats bar */}
      <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
        <span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">{stats.total}</span> total users
        </span>
        <span>
          <span className="font-semibold text-green-700 dark:text-green-400">{stats.licensed}</span> licensed
        </span>
        <span>
          <span className="font-semibold text-blue-700 dark:text-blue-400">{stats.active}</span> active
        </span>
        {activeFilterCount > 0 && (
          <span className="text-amber-600">
            {filteredUsers.length} of {mergedUsers.length} shown
          </span>
        )}
      </div>

      {/* Advanced Filters Panel */}
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <span>Advanced Filters</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                {activeFilterCount}
              </span>
            )}
          </div>
          {filtersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {filtersOpen && (
          <div className="border-t border-gray-200 px-4 py-4 dark:border-gray-700">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              <FilterSelect
                label="License"
                value={filters.hasLicense}
                onChange={(v) => updateFilter("hasLicense", v as AdvancedFilters["hasLicense"])}
                options={[
                  { value: "all", label: "All" },
                  { value: "yes", label: "Licensed" },
                  { value: "no", label: "No License" },
                ]}
              />
              <FilterSelect
                label="Plan"
                value={filters.plan}
                onChange={(v) => updateFilter("plan", v as AdvancedFilters["plan"])}
                options={[
                  { value: "all", label: "All" },
                  { value: "enterprise", label: "Enterprise" },
                  { value: "business", label: "Business" },
                ]}
              />
              <FilterSelect
                label="Status"
                value={filters.status}
                onChange={(v) => updateFilter("status", v as AdvancedFilters["status"])}
                options={[
                  { value: "all", label: "All" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                  { value: "never_active", label: "Never Active" },
                ]}
              />
              <FilterSelect
                label="Used Agent"
                value={filters.usedAgent}
                onChange={(v) => updateFilter("usedAgent", v as AdvancedFilters["usedAgent"])}
                options={[
                  { value: "all", label: "All" },
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]}
              />
              <FilterSelect
                label="Used Chat"
                value={filters.usedChat}
                onChange={(v) => updateFilter("usedChat", v as AdvancedFilters["usedChat"])}
                options={[
                  { value: "all", label: "All" },
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]}
              />
              <FilterSelect
                label="Used CLI"
                value={filters.usedCli}
                onChange={(v) => updateFilter("usedCli", v as AdvancedFilters["usedCli"])}
                options={[
                  { value: "all", label: "All" },
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]}
              />
              <FilterRange
                label="Days Active"
                minValue={filters.minDaysActive}
                maxValue={filters.maxDaysActive}
                onMinChange={(v) => updateFilter("minDaysActive", v)}
                onMaxChange={(v) => updateFilter("maxDaysActive", v)}
                placeholder={["Min", "Max"]}
              />
              <FilterRange
                label="Interactions"
                minValue={filters.minInteractions}
                maxValue={filters.maxInteractions}
                onMinChange={(v) => updateFilter("minInteractions", v)}
                onMaxChange={(v) => updateFilter("maxInteractions", v)}
                placeholder={["Min", "Max"]}
              />
              <FilterRange
                label="Acceptance Rate (%)"
                minValue={filters.minAcceptanceRate}
                maxValue={filters.maxAcceptanceRate}
                onMinChange={(v) => updateFilter("minAcceptanceRate", v)}
                onMaxChange={(v) => updateFilter("maxAcceptanceRate", v)}
                placeholder={["0", "100"]}
                step="0.1"
              />
            </div>
            {activeFilterCount > 0 && (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={resetFilters}
                  className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Unified Table */}
      <DataTable
        columns={columns}
        data={filteredUsers as unknown as Record<string, unknown>[]}
        emptyMessage={t("users.noUsersMatch")}
        searchPlaceholder={t("users.searchPlaceholder")}
        pageSize={25}
        defaultSortKey="login"
      />
        </>
      )}
    </div>
  );
}
