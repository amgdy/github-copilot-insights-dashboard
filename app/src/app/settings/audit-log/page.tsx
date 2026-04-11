"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";

interface AuditEntry {
  id: number;
  action: string;
  category: string;
  actor: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditResponse {
  data: AuditEntry[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

const CATEGORY_COLORS: Record<string, string> = {
  auth: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  settings: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  data_sync: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  admin: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  system: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

function formatAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const res = await fetch("/api/audit-log?page=1&pageSize=100");
        if (res.ok) {
          const result: AuditResponse = await res.json();
          setEntries(result.data);
        }
      } catch (err) {
        console.error("Failed to fetch audit log:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  const columns = [
    {
      key: "createdAt" as const,
      header: "Timestamp",
      render: (value: unknown) => (
        <span className="whitespace-nowrap text-gray-500 dark:text-gray-400">
          {formatTimestamp(String(value))}
        </span>
      ),
    },
    {
      key: "action" as const,
      header: "Action",
      render: (value: unknown) => (
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {formatAction(String(value))}
        </span>
      ),
    },
    {
      key: "category" as const,
      header: "Category",
      render: (value: unknown) => {
        const cat = String(value);
        return (
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
              CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
            )}
          >
            {cat}
          </span>
        );
      },
    },
    {
      key: "actor" as const,
      header: "Actor",
      render: (value: unknown) => (
        <span className="text-gray-600 dark:text-gray-400">{String(value)}</span>
      ),
    },
    {
      key: "ipAddress" as const,
      header: "IP Address",
      render: (value: unknown) => (
        <span className="font-mono text-xs text-gray-400 dark:text-gray-500">
          {value ? String(value) : "—"}
        </span>
      ),
    },
  ];

  if (loading) {
    return <LoadingSpinner message="Loading audit log…" />;
  }

  return (
    <div className="space-y-4">
      <DataTable
        columns={columns}
        data={entries as unknown as Record<string, unknown>[]}
        emptyMessage="No audit log entries found"
        searchPlaceholder="Search actions, actors, categories..."
        pageSize={25}
        defaultSortKey="createdAt"
        defaultSortDir="desc"
        exportFileName={`audit-log-${new Date().toISOString().split("T")[0]}`}
      />
    </div>
  );
}
