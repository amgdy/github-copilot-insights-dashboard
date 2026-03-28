"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Lock, Loader2, AlertCircle, Settings, Database } from "lucide-react";

function AdminGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("admin_authenticated");
    if (stored === "true") {
      setAuthenticated(true);
    }
    setChecking(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        sessionStorage.setItem("admin_authenticated", "true");
        setAuthenticated(true);
      } else {
        const data = await res.json();
        setError(data.error ?? "Invalid password");
      }
    } catch {
      setError("Network error");
    } finally {
      setVerifying(false);
    }
  };

  if (checking) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (authenticated) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-xs">
        <div className="mb-4 flex items-center gap-2">
          <Lock className="h-5 w-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Admin Access</h2>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          Enter the admin password to access settings.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            autoFocus
            className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            autoComplete="off"
          />
          {error && (
            <p className="mb-3 flex items-center gap-1 text-sm text-red-600">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={!password.trim() || verifying}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {verifying ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : (
              "Unlock Settings"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

const tabs = [
  { label: "Configuration", href: "/settings", icon: Settings },
  { label: "Data Sync", href: "/settings/data-sync", icon: Database },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AdminGate>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">
            Manage your GitHub connection, sync schedule, and data ingestion.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {tabs.map((tab) => {
            const isActive =
              tab.href === "/settings"
                ? pathname === "/settings"
                : pathname.startsWith(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </div>

        {children}
      </div>
    </AdminGate>
  );
}
