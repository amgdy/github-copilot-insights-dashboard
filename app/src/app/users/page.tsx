"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { DataSourceBanner } from "@/components/layout/report-filters";

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

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(
          `/api/users?days=28&limit=500&sortBy=interactions&sortDir=desc`
        );
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users ?? []);
        }
      } catch (err) {
        console.error("Failed to fetch users:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const columns = [
    {
      key: "displayLabel" as const,
      header: "User",
      render: (value: unknown) => (
        <span className="font-medium text-gray-900">{String(value)}</span>
      ),
    },
    {
      key: "daysActive" as const,
      header: "Days Active",
      align: "right" as const,
    },
    {
      key: "totalInteractions" as const,
      header: "Interactions",
      align: "right" as const,
      render: (value: unknown) => Number(value).toLocaleString(),
    },
    {
      key: "avgInteractionsPerDay" as const,
      header: "Avg/Day",
      align: "right" as const,
      render: (value: unknown) => Number(value).toFixed(1),
    },
    {
      key: "acceptanceRate" as const,
      header: "Accept %",
      align: "right" as const,
      render: (value: unknown) => `${Number(value).toFixed(1)}%`,
    },
    {
      key: "usedAgent" as const,
      header: "Agent",
      align: "center" as const,
      render: (value: unknown) =>
        value ? (
          <span className="text-green-600">Yes</span>
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      key: "usedChat" as const,
      header: "Chat",
      align: "center" as const,
      render: (value: unknown) =>
        value ? (
          <span className="text-green-600">Yes</span>
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      key: "lastActiveDate" as const,
      header: "Last Active",
      render: (value: unknown) => String(value),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumb
          items={[
            { label: "Users", href: "/users" },
          ]}
        />
        <h1 className="mt-1 text-xl font-bold text-gray-900">GitHub Copilot User Explorer</h1>
        <p className="text-sm text-gray-500">
          Search, filter, and analyze individual user engagement
        </p>
      </div>
      <DataSourceBanner />

      {/* Table */}
      <DataTable
        columns={columns}
        data={users as unknown as Record<string, unknown>[]}
        loading={loading}
        emptyMessage="No users found for the selected period"
        searchPlaceholder="Search by name or username..."
        pageSize={25}
      />
    </div>
  );
}
