"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useTranslation } from "@/lib/i18n/locale-provider";

/* ── Types ── */

export interface FilterOptions {
  users: Array<{ id: number; login: string; displayLabel: string }>;
  orgs: Array<{ id: number; name: string }>;
}

export interface DataRange {
  dataStart: string | null;
  dataEnd: string | null;
  totalRows: number;
  lastSyncAt: string | null;
  lastSyncSource: string | null;
}

export interface FilterState {
  startDate: string;
  endDate: string;
  userId: string;
  /** Comma-separated org IDs for multi-select, or empty string for "all". */
  orgId: string;
}

interface ReportFiltersProps {
  onApply: (state: FilterState) => void;
  onDataRange?: (range: DataRange) => void;
  defaultDays?: number;
  showUserFilter?: boolean;
  sourceLabel?: string;
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function fmtDateShort(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Compute the number of days between two YYYY-MM-DD strings (inclusive). */
function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/** Format a date range for display: "Jan 1 – Mar 31, 2026 (90 days)" */
export function formatDateRangeLabel(start: string, end: string): string {
  return `${fmtDateShort(start)} – ${fmtDateShort(end)} (${daysBetween(start, end)} days)`;
}

/* ── ReportFilters ── */

export function ReportFilters({ onApply, onDataRange, defaultDays = 28, showUserFilter = true, sourceLabel }: ReportFiltersProps) {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState(daysAgoStr(defaultDays));
  const [endDate, setEndDate] = useState(todayStr());
  const [userId, setUserId] = useState("");
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ users: [], orgs: [] });
  const [dataRange, setDataRange] = useState<DataRange | null>(null);

  // Searchable user dropdown state
  const [userSearch, setUserSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Org multi-select dropdown state
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [orgSearchText, setOrgSearchText] = useState("");
  const orgDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch filter options and data range in parallel, then set date defaults from data range
  const didInit = useRef(false);
  useEffect(() => {
    Promise.all([
      fetch("/api/filters").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/data-range").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([filters, range]) => {
        if (filters) setFilterOptions(filters);
        if (range) {
          setDataRange(range);
          onDataRange?.(range);
          const start = range.dataStart ?? daysAgoStr(defaultDays);
          const end = range.dataEnd ?? todayStr();
          setStartDate(start);
          setEndDate(end);
          if (!didInit.current) {
            didInit.current = true;
            onApply({ startDate: start, endDate: end, userId: "", orgId: "" });
          }
        } else if (!didInit.current) {
          didInit.current = true;
          onApply({ startDate, endDate, userId, orgId: selectedOrgIds.join(",") });
        }
      })
      .catch((err) => {
        console.error("Failed to load filter options:", err);
        if (!didInit.current) {
          didInit.current = true;
          onApply({ startDate, endDate, userId, orgId: selectedOrgIds.join(",") });
        }
      });
  }, []);// eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(e.target as Node)) {
        setShowOrgDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleApply = () => {
    const orgId = selectedOrgIds.includes("enterprise")
      ? "enterprise"
      : selectedOrgIds.join(",");
    onApply({ startDate, endDate, userId, orgId });
  };

  const filteredUsers = filterOptions.users.filter((u) => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return u.displayLabel.toLowerCase().includes(q) || u.login.toLowerCase().includes(q);
  });

  const selectedUser = filterOptions.users.find((u) => String(u.id) === userId);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-gray-500 dark:text-gray-400">{t("common.from")}</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          min={dataRange?.dataStart ?? undefined}
          max={dataRange?.dataEnd ?? undefined}
          className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700 shadow-xs focus:border-blue-500 focus:outline-hidden dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-gray-500 dark:text-gray-400">{t("common.to")}</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          min={dataRange?.dataStart ?? undefined}
          max={dataRange?.dataEnd ?? undefined}
          className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700 shadow-xs focus:border-blue-500 focus:outline-hidden dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        />
      </div>
      {/* Searchable user dropdown — hidden when showUserFilter is false */}
      {showUserFilter && (
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setShowDropdown(!showDropdown)}
            className="w-44 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-left text-sm text-gray-700 shadow-xs focus:border-blue-500 focus:outline-hidden truncate dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            {selectedUser ? selectedUser.displayLabel : t("common.allUsers")}
          </button>
          {showDropdown && (
            <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
              <div className="border-b border-gray-100 p-2 dark:border-gray-700">
                <input
                  type="text"
                  placeholder={t("common.searchUsers")}
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full rounded-sm border border-gray-200 px-2.5 py-1.5 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-hidden dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  autoFocus
                />
              </div>
              <ul className="max-h-60 overflow-y-auto py-1">
                <li>
                  <button
                    type="button"
                    onClick={() => { setUserId(""); setShowDropdown(false); setUserSearch(""); }}
                    className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${!userId ? "bg-blue-50 text-blue-700 font-medium dark:bg-blue-900/30 dark:text-blue-400" : "text-gray-700 dark:text-gray-300"}`}
                  >
                    {t("common.allUsers")}
                  </button>
                </li>
                {filteredUsers.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => { setUserId(String(u.id)); setShowDropdown(false); setUserSearch(""); }}
                      className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 truncate dark:hover:bg-gray-700 ${String(u.id) === userId ? "bg-blue-50 text-blue-700 font-medium dark:bg-blue-900/30 dark:text-blue-400" : "text-gray-700 dark:text-gray-300"}`}
                    >
                      {u.displayLabel}
                    </button>
                  </li>
                ))}
                {filteredUsers.length === 0 && (
                  <li className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">{t("common.noUsersFound")}</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
      {/* Org filter — multi-select, only show when orgs exist */}
      {filterOptions.orgs.length > 0 && (
        <div ref={orgDropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setShowOrgDropdown(!showOrgDropdown)}
            className="w-48 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-left text-sm text-gray-700 shadow-xs focus:border-blue-500 focus:outline-hidden truncate dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            {selectedOrgIds.includes("enterprise")
              ? t("common.enterprise")
              : selectedOrgIds.length === 0
                ? t("common.allOrganizations")
                : selectedOrgIds.length === 1
                  ? filterOptions.orgs.find((o) => String(o.id) === selectedOrgIds[0])?.name ?? "1 org"
                  : `${selectedOrgIds.length} organizations`}
          </button>
          {showOrgDropdown && (
            <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
              <div className="border-b border-gray-100 p-2 dark:border-gray-700">
                <input
                  type="text"
                  placeholder={t("common.searchOrganizations")}
                  value={orgSearchText}
                  onChange={(e) => setOrgSearchText(e.target.value)}
                  className="w-full rounded-sm border border-gray-200 px-2.5 py-1.5 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-hidden dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  autoFocus
                />
              </div>
              <ul className="max-h-60 overflow-y-auto py-1">
                <li>
                  <button
                    type="button"
                    onClick={() => { setSelectedOrgIds([]); }}
                    className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${selectedOrgIds.length === 0 && !selectedOrgIds.includes("enterprise") ? "bg-blue-50 text-blue-700 font-medium dark:bg-blue-900/30 dark:text-blue-400" : "text-gray-700 dark:text-gray-300"}`}
                  >
                    {t("common.allOrganizations")}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => { setSelectedOrgIds(["enterprise"]); }}
                    className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${selectedOrgIds.includes("enterprise") ? "bg-purple-50 text-purple-700 font-medium dark:bg-purple-900/30 dark:text-purple-400" : "text-gray-700 dark:text-gray-300"}`}
                  >
                    ✦ {t("common.enterprise")}
                  </button>
                </li>
                <li>
                  <div className="mx-3 my-1 border-t border-gray-100 dark:border-gray-700" />
                </li>
                {filterOptions.orgs
                  .filter((o) => !orgSearchText || o.name.toLowerCase().includes(orgSearchText.toLowerCase()))
                  .map((o) => {
                    const isSelected = selectedOrgIds.includes(String(o.id));
                    return (
                      <li key={o.id}>
                        <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={selectedOrgIds.includes("enterprise")}
                            onChange={() => {
                              setSelectedOrgIds((prev) =>
                                isSelected
                                  ? prev.filter((id) => id !== String(o.id))
                                  : [...prev.filter((id) => id !== "enterprise"), String(o.id)]
                              );
                            }}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
                          />
                          <span className={isSelected ? "font-medium text-blue-700 dark:text-blue-400" : selectedOrgIds.includes("enterprise") ? "text-gray-400 dark:text-gray-600" : "text-gray-700 dark:text-gray-300"}>
                            {o.name}
                          </span>
                        </label>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}
        </div>
      )}
      <button
        onClick={handleApply}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-blue-700"
      >
        {t("common.apply")}
      </button>
    </div>
  );
}

/* ── DataSourceBanner ── */

export function DataSourceBanner({ sourceLabel }: { sourceLabel?: string } = {}) {
  const { t } = useTranslation();
  const [range, setRange] = useState<DataRange | null>(null);

  useEffect(() => {
    fetch("/api/data-range")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setRange(d); })
      .catch((err) => console.error("Failed to load data range:", err));
  }, []);

  if (!range || !range.dataStart) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
      <span>
        <span className="font-medium text-gray-600 dark:text-gray-300">{t("dataSource.label")}</span> {sourceLabel ?? t("dataSource.defaultSource")}
      </span>
      <span>
        <span className="font-medium text-gray-600 dark:text-gray-300">{t("dataSource.range")}</span>{" "}
        {fmtDateShort(range.dataStart)} – {fmtDateShort(range.dataEnd!)}
      </span>
      {range.lastSyncAt && (
        <span>
          <span className="font-medium text-gray-600 dark:text-gray-300">{t("dataSource.lastSync")}</span>{" "}
          {fmtDateTime(range.lastSyncAt)} ({range.lastSyncSource})
        </span>
      )}
    </div>
  );
}
