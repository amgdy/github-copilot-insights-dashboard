/**
 * Dark-mode-aware chart option presets for Chart.js.
 */

"use client";

import { useMemo } from "react";
import { useTheme } from "@/lib/theme/theme-provider";

export function getCommonOptions(isDark: boolean) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: isDark ? "#1e293b" : "#fff",
        titleColor: isDark ? "#f1f5f9" : "#111827",
        bodyColor: isDark ? "#cbd5e1" : "#374151",
        borderColor: isDark ? "#475569" : "#e5e7eb",
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
        boxPadding: 4,
        titleFont: { weight: "bold" as const, size: 12 },
        bodyFont: { size: 11 },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: isDark ? "#94a3b8" : "#9ca3af" },
      },
      y: {
        grid: { color: isDark ? "#334155" : "#f0f0f0" },
        ticks: { font: { size: 11 }, color: isDark ? "#94a3b8" : "#9ca3af" },
      },
    },
  };
}

export function getLegendPreset(isDark: boolean) {
  return {
    display: true,
    position: "top" as const,
    labels: {
      usePointStyle: true,
      pointStyle: "circle" as const,
      font: { size: 11 },
      color: isDark ? "#cbd5e1" : undefined,
    },
  };
}

export function getDoughnutOptions(isDark: boolean) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "55%",
    plugins: {
      legend: {
        position: "right" as const,
        labels: {
          usePointStyle: true,
          pointStyle: "circle" as const,
          font: { size: 11 },
          padding: 12,
          color: isDark ? "#cbd5e1" : undefined,
        },
      },
      tooltip: getCommonOptions(isDark).plugins.tooltip,
    },
  };
}

/**
 * Hook that returns theme-aware chart options, automatically updating when theme changes.
 */
export function useChartOptions() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const commonOptions = useMemo(() => getCommonOptions(isDark), [isDark]);
  const doughnutOptions = useMemo(() => getDoughnutOptions(isDark), [isDark]);
  const legendPreset = useMemo(() => getLegendPreset(isDark), [isDark]);
  return { commonOptions, doughnutOptions, legendPreset, isDark };
}
