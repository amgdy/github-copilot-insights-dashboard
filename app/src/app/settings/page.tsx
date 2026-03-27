"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Save,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  Loader2,
  DatabaseZap,
  Clock,
} from "lucide-react";

interface SettingState {
  configured: boolean;
  masked?: string;
  value?: string;
}

interface SettingsData {
  settings: {
    github_token: SettingState;
    github_enterprise_slug: SettingState;
  };
  envFallback: {
    github_token: boolean;
    github_enterprise_slug: string | null;
  };
}

interface SyncIntervalData {
  intervalHours: number;
  allowedIntervals: number[];
  note: string;
}

export default function ConfigurationPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [syncData, setSyncData] = useState<SyncIntervalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [tokenInput, setTokenInput] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [selectedInterval, setSelectedInterval] = useState<number>(24);
  const [savingInterval, setSavingInterval] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const [settingsRes, intervalRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/settings/sync-interval"),
      ]);
      if (settingsRes.ok) {
        const result: SettingsData = await settingsRes.json();
        setData(result);
        if (result.settings.github_enterprise_slug.value) {
          setSlugInput(result.settings.github_enterprise_slug.value);
        }
      }
      if (intervalRes.ok) {
        const result: SyncIntervalData = await intervalRes.json();
        setSyncData(result);
        setSelectedInterval(result.intervalHours);
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleSave = async (key: string, value: string) => {
    if (!value.trim()) {
      showMessage("error", "Value cannot be empty");
      return;
    }
    setSaving(key);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: value.trim() }),
      });
      if (res.ok) {
        showMessage("success", `${key === "github_token" ? "Token" : "Enterprise slug"} saved successfully`);
        if (key === "github_token") setTokenInput("");
        await fetchSettings();
      } else {
        const err = await res.json();
        showMessage("error", err.error ?? "Failed to save");
      }
    } catch {
      showMessage("error", "Network error");
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (key: string) => {
    setDeleting(key);
    try {
      const res = await fetch("/api/settings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (res.ok) {
        showMessage("success", "Setting removed. Will fall back to environment variable if set.");
        if (key === "github_enterprise_slug") setSlugInput("");
        await fetchSettings();
      } else {
        const err = await res.json();
        showMessage("error", err.error ?? "Failed to delete");
      }
    } catch {
      showMessage("error", "Network error");
    } finally {
      setDeleting(null);
    }
  };

  const handleSaveInterval = async () => {
    setSavingInterval(true);
    try {
      const res = await fetch("/api/settings/sync-interval", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalHours: selectedInterval }),
      });
      if (res.ok) {
        const result = await res.json();
        showMessage("success", result.message ?? `Sync interval set to ${selectedInterval}h`);
        await fetchSettings();
      } else {
        const err = await res.json();
        showMessage("error", err.error ?? "Failed to save sync interval");
      }
    } catch {
      showMessage("error", "Network error");
    } finally {
      setSavingInterval(false);
    }
  };

  const handleReset = async () => {
    setShowResetConfirm(false);
    setResetting(true);
    try {
      const res = await fetch("/api/admin/reset", { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        showMessage("success", result.message ?? "Database reset successfully");
      } else {
        const err = await res.json();
        showMessage("error", err.error ?? "Failed to reset database");
      }
    } catch {
      showMessage("error", "Network error during reset");
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status message */}
      {message && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {/* GitHub Token */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">GitHub Personal Access Token</h2>
          {data?.settings.github_token.configured && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              <CheckCircle className="h-3 w-3" /> Configured
            </span>
          )}
        </div>
        <p className="mb-3 text-xs text-gray-500">
          Classic token scopes: <code className="rounded bg-gray-100 px-1">manage_billing:copilot</code> (read),{" "}
          <code className="rounded bg-gray-100 px-1">read:enterprise</code>,{" "}
          <code className="rounded bg-gray-100 px-1">read:org</code>,{" "}
          <code className="rounded bg-gray-100 px-1">read:user</code>.{" "}
          Fine-grained: <code className="rounded bg-gray-100 px-1">Enterprise Copilot metrics</code> (read).{" "}
          <a
            href="https://github.com/settings/tokens/new?scopes=manage_billing:copilot,read:enterprise,read:org,read:user&description=Copilot+Insights+Dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Generate token
          </a>
        </p>

        {data?.settings.github_token.configured && (
          <p className="mb-3 text-xs text-gray-500">
            Current: <code className="rounded bg-gray-100 px-1">{data.settings.github_token.masked}</code>
          </p>
        )}

        {data?.envFallback.github_token && !data?.settings.github_token.configured && (
          <p className="mb-3 text-xs text-amber-600">
            Using environment variable fallback (GITHUB_TOKEN).
          </p>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showToken ? "text" : "password"}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder={data?.settings.github_token.configured ? "Enter new token to update" : "ghp_xxxxxxxxxxxx"}
              className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={showToken ? "Hide token" : "Show token"}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <button
            onClick={() => handleSave("github_token", tokenInput)}
            disabled={!tokenInput.trim() || saving === "github_token"}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving === "github_token" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
          {data?.settings.github_token.configured && (
            <button
              onClick={() => handleDelete("github_token")}
              disabled={deleting === "github_token"}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              title="Remove saved token"
            >
              {deleting === "github_token" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Enterprise Slug */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">GitHub Enterprise Slug</h2>
          {data?.settings.github_enterprise_slug.configured && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              <CheckCircle className="h-3 w-3" /> Configured
            </span>
          )}
        </div>
        <p className="mb-3 text-xs text-gray-500">
          The slug of your GitHub Enterprise (e.g. &quot;my-enterprise&quot;). Found in your enterprise URL:
          github.com/enterprises/<strong>your-slug</strong>
        </p>

        {data?.envFallback.github_enterprise_slug && !data?.settings.github_enterprise_slug.configured && (
          <p className="mb-3 text-xs text-amber-600">
            Using environment variable fallback: <code className="rounded bg-gray-100 px-1">{data.envFallback.github_enterprise_slug}</code>
          </p>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={slugInput}
            onChange={(e) => setSlugInput(e.target.value)}
            placeholder="my-enterprise"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={() => handleSave("github_enterprise_slug", slugInput)}
            disabled={!slugInput.trim() || saving === "github_enterprise_slug"}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving === "github_enterprise_slug" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
          {data?.settings.github_enterprise_slug.configured && (
            <button
              onClick={() => handleDelete("github_enterprise_slug")}
              disabled={deleting === "github_enterprise_slug"}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              title="Remove saved slug"
            >
              {deleting === "github_enterprise_slug" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Sync Schedule */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-1 flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-600" />
          <h2 className="text-sm font-semibold text-gray-900">Automatic Sync Schedule</h2>
        </div>
        <p className="mb-3 text-xs text-gray-500">
          {syncData?.note ?? "GitHub Copilot Metrics API data refreshes approximately once every 24 hours."}{" "}
          Choose how often the dashboard pulls fresh data.
        </p>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            {(syncData?.allowedIntervals ?? [1, 6, 12, 24]).map((h) => (
              <button
                key={h}
                onClick={() => setSelectedInterval(h)}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedInterval === h
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {h === 1 ? "1 hour" : `${h} hours`}
              </button>
            ))}
          </div>
          <button
            onClick={handleSaveInterval}
            disabled={savingInterval || selectedInterval === syncData?.intervalHours}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingInterval ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
        {selectedInterval !== syncData?.intervalHours && (
          <p className="mt-2 text-xs text-amber-600">
            App restart required for interval changes to take effect.
          </p>
        )}
      </div>

      {/* Info */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-medium">How settings are resolved</p>
        <p className="mt-1 text-xs text-blue-700">
          Settings saved here take precedence over environment variables. If no value is saved in the
          database, the app falls back to <code className="rounded bg-blue-100 px-1">GITHUB_TOKEN</code> and{" "}
          <code className="rounded bg-blue-100 px-1">GITHUB_ENTERPRISE_SLUG</code> environment variables.
        </p>
      </div>

      {/* Database Management */}
      <div className="rounded-lg border border-red-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Database Management</h2>
        <p className="mt-1 mb-4 text-xs text-gray-500">
          Reset the database to clear all ingested data. Configuration settings (token, slug) will be preserved.
        </p>
        <button
          onClick={() => setShowResetConfirm(true)}
          disabled={resetting}
          className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
          {resetting ? "Resetting…" : "Reset Database"}
        </button>
      </div>

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-red-600">Reset database?</h3>
            <p className="mt-2 text-sm text-gray-600">
              This will permanently delete all ingested Copilot usage data. Your settings
              (token, enterprise slug) will be preserved. This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Yes, Reset Database
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
