"use client";

import { useEffect, useState } from "react";
import { Lock, Loader2, AlertCircle } from "lucide-react";

/**
 * Global authentication gate. When DASHBOARD_PASSWORD is set on the server,
 * every page is protected behind a password prompt. If the env var is
 * not set the gate is transparent and children render immediately.
 *
 * This is separate from the admin password (ADMIN_PASSWORD) which
 * protects the Settings pages.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "open" | "locked" | "authenticated">("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    fetch("/api/auth/verify-dashboard")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to check auth"))))
      .then((data: { required: boolean }) => {
        if (!data.required) {
          setStatus("open");
        } else if (typeof window !== "undefined" && sessionStorage.getItem("dashboard_authenticated") === "true") {
          setStatus("authenticated");
        } else {
          setStatus("locked");
        }
      })
      .catch(() => {
        // If auth check fails, allow access (fail-open for usability)
        setStatus("open");
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        sessionStorage.setItem("dashboard_authenticated", "true");
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
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <svg className="h-10 w-10 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-gray-500 dark:text-gray-400">Loading…</span>
        </div>
      </div>
    );
  }

  if (status === "open" || status === "authenticated") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center gap-2">
          <Lock className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Dashboard Access</h2>
        </div>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Enter the password to access the Copilot Insights dashboard.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
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
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {verifying ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : (
              "Unlock"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
