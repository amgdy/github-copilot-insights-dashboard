"use client";

import { useEffect, useState, useRef, useCallback } from "react";

/* ── Types ── */

export interface FilterOptions {
  users: Array<{ id: number; login: string; displayLabel: string }>;
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
}

interface ReportFiltersProps {
  onApply: (state: FilterState) => void;
  defaultDays?: number;
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

/* ── ReportFilters ── */

export function ReportFilters({ onApply, defaultDays = 28 }: ReportFiltersProps) {
  const [startDate, setStartDate] = useState(daysAgoStr(defaultDays));
  const [endDate, setEndDate] = useState(todayStr());
  const [userId, setUserId] = useState("");
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ users: [] });

  // Searchable user dropdown state
  const [userSearch, setUserSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/filters")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setFilterOptions(d); })
      .catch((err) => console.error("Failed to load filter options:", err));
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Trigger initial load
  const didInit = useRef(false);
  useEffect(() => {
    if (!didInit.current) {
      didInit.current = true;
      onApply({ startDate, endDate, userId });
    }
  }, []);// eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = () => {
    onApply({ startDate, endDate, userId });
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
        <label className="text-xs text-gray-500">From</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-gray-500">To</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      {/* Searchable user dropdown */}
      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          className="w-44 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-left text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none truncate"
        >
          {selectedUser ? selectedUser.displayLabel : "All users"}
        </button>
        {showDropdown && (
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-100 p-2">
              <input
                type="text"
                placeholder="Search users…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full rounded border border-gray-200 px-2.5 py-1.5 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                autoFocus
              />
            </div>
            <ul className="max-h-60 overflow-y-auto py-1">
              <li>
                <button
                  type="button"
                  onClick={() => { setUserId(""); setShowDropdown(false); setUserSearch(""); }}
                  className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${!userId ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"}`}
                >
                  All users
                </button>
              </li>
              {filteredUsers.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => { setUserId(String(u.id)); setShowDropdown(false); setUserSearch(""); }}
                    className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 truncate ${String(u.id) === userId ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"}`}
                  >
                    {u.displayLabel}
                  </button>
                </li>
              ))}
              {filteredUsers.length === 0 && (
                <li className="px-3 py-2 text-xs text-gray-400">No users found</li>
              )}
            </ul>
          </div>
        )}
      </div>
      <button
        onClick={handleApply}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
      >
        Apply
      </button>
    </div>
  );
}

/* ── DataSourceBanner ── */

export function DataSourceBanner() {
  const [range, setRange] = useState<DataRange | null>(null);

  useEffect(() => {
    fetch("/api/data-range")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setRange(d); })
      .catch((err) => console.error("Failed to load data range:", err));
  }, []);

  if (!range || !range.dataStart) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
      <span>
        <span className="font-medium text-gray-600">Data source:</span> Ingested Copilot usage data
      </span>
      <span>
        <span className="font-medium text-gray-600">Range:</span>{" "}
        {fmtDateShort(range.dataStart)} – {fmtDateShort(range.dataEnd!)}
      </span>
      {range.lastSyncAt && (
        <span>
          <span className="font-medium text-gray-600">Last sync:</span>{" "}
          {fmtDateTime(range.lastSyncAt)} ({range.lastSyncSource})
        </span>
      )}
    </div>
  );
}
