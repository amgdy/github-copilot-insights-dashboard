"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, Loader2, AlertCircle } from "lucide-react";

/**
 * Admin authentication gate for the Settings area.
 * Checks ADMIN_PASSWORD via /api/auth/verify-admin.
 * Separate from the dashboard-level AuthGate (which uses DASHBOARD_PASSWORD).
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "open" | "locked" | "authenticated">("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    fetch("/api/auth/verify-admin")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to check auth"))))
      .then((data: { required: boolean }) => {
        if (!data.required) {
          setStatus("open");
        } else if (typeof window !== "undefined" && sessionStorage.getItem("admin_authenticated") === "true") {
          setStatus("authenticated");
        } else {
          setStatus("locked");
        }
      })
      .catch(() => {
        setStatus("open");
      });
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
        setStatus("authenticated");
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

  if (status === "checking") {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (status === "open" || status === "authenticated") {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto mt-12 w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-amber-600" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Admin Access Required</h2>
      </div>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Enter the admin password to access Settings.
      </p>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
          autoFocus
          className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          autoComplete="off"
        />
        {error && (
          <p className="mb-3 flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={!password.trim() || verifying}
          className="w-full rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {verifying ? (
            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          ) : (
            "Unlock Settings"
          )}
        </button>
      </form>
    </div>
  );
}
