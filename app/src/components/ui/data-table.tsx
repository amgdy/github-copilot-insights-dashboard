"use client";

import { useState, useMemo, useCallback } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useTranslation } from "@/lib/i18n/locale-provider";

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
  exportFileName?: string;
  defaultSortKey?: keyof T;
  defaultSortDir?: "asc" | "desc";
}

type SortDir = "asc" | "desc" | null;

/** Convert value to plain text for export (strips JSX). */
function toExportValue(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val);
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading = false,
  emptyMessage = "No data available",
  onRowClick,
  pageSize = 25,
  searchable = true,
  searchPlaceholder = "Search...",
  exportFileName = "export",
  defaultSortKey,
  defaultSortDir = "asc",
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<keyof T | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortKey ? defaultSortDir : null);
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

  /** Build export rows from current sorted/filtered data (all pages). */
  const buildExportRows = useCallback((): string[][] => {
    const headers = columns.map((c) => c.header);
    const rows = sorted.map((row) =>
      columns.map((col) => toExportValue(row[col.key]))
    );
    return [headers, ...rows];
  }, [sorted, columns]);

  const handleExportCsv = useCallback(() => {
    const rows = buildExportRows();
    const csv = rows
      .map((r) =>
        r.map((cell) => {
          const escaped = cell.replace(/"/g, '""');
          return /[,"\n\r]/.test(cell) ? `"${escaped}"` : escaped;
        }).join(",")
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [buildExportRows, exportFileName]);

  const handleExportExcel = useCallback(async () => {
    try {
      const XLSX = await import("xlsx");
      const rows = buildExportRows();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Data");
      XLSX.writeFile(wb, `${exportFileName}.xlsx`);
    } catch (err) {
      console.error("Excel export failed:", err);
      // Fallback to CSV if xlsx is not available
      handleExportCsv();
    }
  }, [buildExportRows, exportFileName, handleExportCsv]);

  if (loading) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-sm bg-gray-100 dark:bg-gray-700" />
          ))}
        </div>
      </div>
    );
  }

  const hasColumnFilters = columns.some((c) => c.filterable !== false);

  return (
    <div className="space-y-3">
      {/* Search bar + count + export */}
      {searchable && (
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-72 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500"
            aria-label="Search table"
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {filtered.length} {filtered.length === 1 ? t("common.row") : t("common.rows")}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={handleExportCsv}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-xs hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              title={t("common.csvExport")}
            >
              <Download className="h-3.5 w-3.5" />
              {t("common.csvExport")}
            </button>
            <button
              onClick={handleExportExcel}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-xs hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              title={t("common.excelExport")}
            >
              <Download className="h-3.5 w-3.5" />
              {t("common.excelExport")}
            </button>
          </div>
        </div>
      )}

      {data.length === 0 && !search ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-gray-200 bg-white text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          {emptyMessage}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                {columns.map((col) => {
                  const isSortable = col.sortable !== false;
                  const isActive = sortKey === col.key;
                  return (
                    <th
                      key={String(col.key)}
                      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 ${
                        col.align === "right"
                          ? "text-right"
                          : col.align === "center"
                            ? "text-center"
                            : "text-left"
                      } ${isSortable ? "cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200" : ""}`}
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
                <tr className="border-b border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/50">
                  {columns.map((col) => (
                    <th key={`filter-${String(col.key)}`} className="px-4 py-1.5">
                      {col.filterable !== false ? (
                        <input
                          type="text"
                          placeholder={t("common.filterPlaceholder")}
                          value={columnFilters[String(col.key)] ?? ""}
                          onChange={(e) => handleColumnFilter(String(col.key), e.target.value)}
                          className="w-full rounded-sm border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-blue-400 focus:outline-hidden dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder:text-gray-500"
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
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    {t("common.noMatchingRows")}
                  </td>
                </tr>
              ) : (
                paged.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className={`border-b border-gray-100 transition-colors last:border-0 dark:border-gray-700 ${
                      onRowClick
                        ? "cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map((col) => (
                      <td
                        key={String(col.key)}
                        className={`px-4 py-2.5 text-gray-700 dark:text-gray-300 ${
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
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-3">
            <span>
              {t("common.showing")} {safePage * currentPageSize + 1}–{Math.min((safePage + 1) * currentPageSize, sorted.length)} {t("common.of")}{" "}
              {sorted.length}
            </span>
            <div className="flex items-center gap-1.5">
              <label htmlFor="page-size" className="text-xs text-gray-500 dark:text-gray-400">{t("common.rows")}:</label>
              <select
                id="page-size"
                value={currentPageSize}
                onChange={(e) => { setCurrentPageSize(Number(e.target.value)); setPage(0); }}
                className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:border-blue-500 focus:outline-hidden dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
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
                className="rounded-sm px-2 py-1 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-700"
                aria-label="First page"
              >
                {t("common.first")}
              </button>
              <button
                onClick={() => setPage(safePage - 1)}
                disabled={safePage === 0}
                className="rounded-sm p-1 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-700"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2">
                {t("common.page")} {safePage + 1} {t("common.of")} {totalPages}
              </span>
              <button
                onClick={() => setPage(safePage + 1)}
                disabled={safePage >= totalPages - 1}
                className="rounded-sm p-1 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-700"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage(totalPages - 1)}
                disabled={safePage >= totalPages - 1}
                className="rounded-sm px-2 py-1 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-700"
                aria-label="Last page"
              >
                {t("common.last")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
