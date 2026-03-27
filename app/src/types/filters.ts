/**
 * Filter types for the dashboard application.
 */

export interface GlobalFilters {
  dateRange: DateRange;
  compareMode: boolean;
  compareDateRange?: DateRange;
  enterpriseId?: number;
  orgIds?: number[];
  teamIds?: number[];
}

export interface DateRange {
  start: string; // ISO date string YYYY-MM-DD
  end: string;
}

export type DatePreset =
  | "last7d"
  | "last14d"
  | "last28d"
  | "last30d"
  | "last60d"
  | "last90d"
  | "last180d"
  | "last365d"
  | "mtd"
  | "qtd"
  | "ytd"
  | "custom";

export interface LocalFilters {
  userIds?: number[];
  ideNames?: string[];
  featureNames?: string[];
  languages?: string[];
  modelNames?: string[];
  segments?: string[];
  usedAgent?: boolean;
  usedChat?: boolean;
  usedCli?: boolean;
  minInteractions?: number;
  minAcceptanceRate?: number;
  topN?: number;
}

export interface FilterState extends GlobalFilters {
  local: LocalFilters;
}

export interface SavedView {
  id: string;
  name: string;
  description?: string;
  filters: FilterState;
  dashboardPath: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BreadcrumbItem {
  label: string;
  href: string;
  filterKey?: string;
  filterValue?: string | number;
}
