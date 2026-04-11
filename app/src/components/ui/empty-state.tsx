"use client";

import Link from "next/link";
import { Database, Search, Settings } from "lucide-react";
import { useTranslation } from "@/lib/i18n/locale-provider";

interface EmptyStateProps {
  /** When true, data has been synced but no results match the current filters. */
  hasData?: boolean;
}

/**
 * Empty state shown on dashboard pages.
 * - Default (hasData=false): "No data has been synced yet" + link to Settings.
 * - hasData=true: "No results for this date range / filters" (no Settings link).
 */
export function EmptyState({ hasData = false }: EmptyStateProps) {
  const { t } = useTranslation();

  if (hasData) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 rounded-full bg-gray-100 p-4 dark:bg-gray-700">
          <Search className="h-8 w-8 text-gray-400 dark:text-gray-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t("common.noResultsForFilters")}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
          {t("common.noResultsForFiltersDesc")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 rounded-full bg-gray-100 p-4 dark:bg-gray-700">
        <Database className="h-8 w-8 text-gray-400 dark:text-gray-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t("common.noSyncedData")}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
        {t("common.noSyncedDataDesc")}
      </p>
      <Link
        href="/settings"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition-colors hover:bg-blue-700"
      >
        <Settings className="h-4 w-4" />
        {t("configBanner.goToSettings")}
      </Link>
    </div>
  );
}
