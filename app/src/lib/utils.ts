import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number with appropriate suffix (K, M, B).
 */
export function formatNumber(value: number): string {
  const v = value ?? 0;
  if (Math.abs(v) >= 1_000_000_000) {
    return `${(v / 1_000_000_000).toFixed(1)}B`;
  }
  if (Math.abs(v) >= 1_000_000) {
    return `${(v / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(v) >= 1_000) {
    return `${(v / 1_000).toFixed(1)}K`;
  }
  return v.toLocaleString();
}

/**
 * Format a percentage value.
 */
export function formatPercent(value: number): string {
  return `${(value ?? 0).toFixed(1)}%`;
}

/**
 * Format a delta with + or - prefix and color class.
 */
export function formatDelta(value: number): {
  text: string;
  className: string;
} {
  const v = value ?? 0;
  const prefix = v > 0 ? "+" : "";
  return {
    text: `${prefix}${v.toFixed(1)}%`,
    className: v > 0 ? "text-growth" : v < 0 ? "text-decline" : "text-gray-500",
  };
}

/**
 * Get the date N days ago as ISO string.
 */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

/**
 * Validate ISO date string format (YYYY-MM-DD).
 */
export function isValidDate(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr));
}
