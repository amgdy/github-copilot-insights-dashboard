"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";

interface Column<T> {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
  sortable?: boolean;
  filterable?: boolean;
  align?: "left" | "center" | "right";
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
}

type SortDir = "asc" | "desc" | null;

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading = false,
  emptyMessage = "No data available",
  onRowClick,
  pageSize = 25,
  searchable = true,
  searchPlaceholder = "Search...",
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [currentPageSize, setCurrentPageSize] = useState(pageSize);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  // Filter data
  const filtered = useMemo(() => {
    let result = data;

    // Global search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((row) =>
        columns.some((col) => {
          const v = row[col.key];
          return v != null && String(v).toLowerCase().includes(q);
        })
      );
    }

    // Per-column filters
    for (const [key, val] of Object.entries(columnFilters)) {
      if (!val) continue;
      const q = val.toLowerCase();
      result = result.filter((row) => {
        const v = row[key as keyof T];
        return v != null && String(v).toLowerCase().includes(q);
      });
    }

    return result;
  }, [data, search, columnFilters, columns]);

  // Sort data
  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;

    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let cmp = 0;
      if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      } else if (typeof aVal === "boolean" && typeof bVal === "boolean") {
        cmp = (aVal ? 1 : 0) - (bVal ? 1 : 0);
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [filtered, sortKey, sortDir]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / currentPageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paged = sorted.slice(safePage * currentPageSize, (safePage + 1) * currentPageSize);

  const handleSort = (key: keyof T) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortKey(null); setSortDir(null); }
      else setSortDir("asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  };

  const handleColumnFilter = (key: string, value: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0);
  };

  if (loading) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  const hasColumnFilters = columns.some((c) => c.filterable !== false);

  return (
    <div className="space-y-3">
      {/* Search bar + count */}
      {searchable && (
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-72 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-label="Search table"
          />
          <span className="text-sm text-gray-500">
            {filtered.length} {filtered.length === 1 ? "row" : "rows"}
          </span>
        </div>
      )}

      {data.length === 0 && !search ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-gray-200 bg-white text-sm text-gray-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {columns.map((col) => {
                  const isSortable = col.sortable !== false;
                  const isActive = sortKey === col.key;
                  return (
                    <th
                      key={String(col.key)}
                      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 ${
                        col.align === "right"
                          ? "text-right"
                          : col.align === "center"
                            ? "text-center"
                            : "text-left"
                      } ${isSortable ? "cursor-pointer select-none hover:text-gray-700" : ""}`}
                      onClick={() => isSortable && handleSort(col.key)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.header}
                        {isSortable && (
                          <span className="inline-flex flex-col">
                            {isActive && sortDir === "asc" ? (
                              <ChevronUp className="h-3.5 w-3.5 text-blue-600" />
                            ) : isActive && sortDir === "desc" ? (
                              <ChevronDown className="h-3.5 w-3.5 text-blue-600" />
                            ) : (
                              <ChevronsUpDown className="h-3.5 w-3.5 text-gray-300" />
                            )}
                          </span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
              {/* Column filter row */}
              {hasColumnFilters && (
                <tr className="border-b border-gray-200 bg-gray-50/50">
                  {columns.map((col) => (
                    <th key={`filter-${String(col.key)}`} className="px-4 py-1.5">
                      {col.filterable !== false ? (
                        <input
                          type="text"
                          placeholder="Filter…"
                          value={columnFilters[String(col.key)] ?? ""}
                          onChange={(e) => handleColumnFilter(String(col.key), e.target.value)}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-blue-400 focus:outline-none"
                          aria-label={`Filter ${col.header}`}
                        />
                      ) : (
                        <span />
                      )}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-gray-500">
                    No matching rows
                  </td>
                </tr>
              ) : (
                paged.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className={`border-b border-gray-100 transition-colors last:border-0 ${
                      onRowClick
                        ? "cursor-pointer hover:bg-blue-50"
                        : "hover:bg-gray-50"
                    }`}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map((col) => (
                      <td
                        key={String(col.key)}
                        className={`px-4 py-2.5 text-gray-700 ${
                          col.align === "right"
                            ? "text-right"
                            : col.align === "center"
                              ? "text-center"
                              : "text-left"
                        }`}
                      >
                        {col.render
                          ? col.render(row[col.key], row)
                          : String(row[col.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {sorted.length > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center gap-3">
            <span>
              Showing {safePage * currentPageSize + 1}–{Math.min((safePage + 1) * currentPageSize, sorted.length)} of{" "}
              {sorted.length}
            </span>
            <div className="flex items-center gap-1.5">
              <label htmlFor="page-size" className="text-xs text-gray-500">Rows:</label>
              <select
                id="page-size"
                value={currentPageSize}
                onChange={(e) => { setCurrentPageSize(Number(e.target.value)); setPage(0); }}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:border-blue-500 focus:outline-none"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(0)}
                disabled={safePage === 0}
                className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40"
                aria-label="First page"
              >
                First
              </button>
              <button
                onClick={() => setPage(safePage - 1)}
                disabled={safePage === 0}
                className="rounded p-1 hover:bg-gray-100 disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2">
                Page {safePage + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(safePage + 1)}
                disabled={safePage >= totalPages - 1}
                className="rounded p-1 hover:bg-gray-100 disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage(totalPages - 1)}
                disabled={safePage >= totalPages - 1}
                className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40"
                aria-label="Last page"
              >
                Last
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
