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
}

export default function ConfigurationPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [tokenInput, setTokenInput] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [showToken, setShowToken] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const settingsRes = await fetch("/api/settings");
      if (settingsRes.ok) {
        const result: SettingsData = await settingsRes.json();
        setData(result);
        if (result.settings.github_enterprise_slug.value) {
          setSlugInput(result.settings.github_enterprise_slug.value);
        }
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
        showMessage("success", "Setting removed.");
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
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300"
          }`}
        >
          {message.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {/* Info */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
        <p className="font-medium">How settings are resolved</p>
        <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">
          Configure your GitHub token and enterprise slug here. Settings are stored securely in the database.
        </p>
      </div>

      {/* GitHub Token */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">GitHub Personal Access Token</h2>
          {data?.settings.github_token.configured && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
              <CheckCircle className="h-3 w-3" /> Configured
            </span>
          )}
        </div>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          <strong className="text-gray-700 dark:text-gray-300">Option 1 — Classic token</strong> (recommended for enterprise):{" "}
          <code className="rounded-sm bg-gray-100 px-1 dark:bg-gray-700">manage_billing:copilot</code>,{" "}
          <code className="rounded-sm bg-gray-100 px-1 dark:bg-gray-700">read:enterprise</code>,{" "}
          <code className="rounded-sm bg-gray-100 px-1 dark:bg-gray-700">read:org</code>.{" "}
          <a
            href="https://github.com/settings/tokens/new?scopes=manage_billing:copilot,read:enterprise,read:org&description=Copilot+Insights+Dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            Generate classic token →
          </a>
        </p>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          <strong className="text-gray-700 dark:text-gray-300">Option 2 — Fine-grained token</strong> (org-level only, does not support enterprise endpoints):{" "}
          select your organization as the resource owner, then enable{" "}
          <code className="rounded-sm bg-gray-100 px-1 dark:bg-gray-700">GitHub Copilot Business</code> (read) under Organization permissions.{" "}
          <a
            href="https://github.com/settings/personal-access-tokens/new"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            Generate fine-grained token →
          </a>
        </p>

        {data?.settings.github_token.configured && (
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Current: <code className="rounded-sm bg-gray-100 px-1 dark:bg-gray-700">{data.settings.github_token.masked}</code>
          </p>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showToken ? "text" : "password"}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder={data?.settings.github_token.configured ? "Enter new token to update" : "ghp_xxxxxxxxxxxx"}
              className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm shadow-xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              aria-label={showToken ? "Hide token" : "Show token"}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <button
            onClick={() => handleSave("github_token", tokenInput)}
            disabled={!tokenInput.trim() || saving === "github_token"}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving === "github_token" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
          {data?.settings.github_token.configured && (
            <button
              onClick={() => handleDelete("github_token")}
              disabled={deleting === "github_token"}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
              title="Remove saved token"
            >
              {deleting === "github_token" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Enterprise Slug */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">GitHub Enterprise Slug</h2>
          {data?.settings.github_enterprise_slug.configured && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
              <CheckCircle className="h-3 w-3" /> Configured
            </span>
          )}
        </div>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          The slug of your GitHub Enterprise (e.g. &quot;my-enterprise&quot;). Found in your enterprise URL:
          github.com/enterprises/<strong>your-slug</strong>
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={slugInput}
            onChange={(e) => setSlugInput(e.target.value)}
            placeholder="my-enterprise"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />
          <button
            onClick={() => handleSave("github_enterprise_slug", slugInput)}
            disabled={!slugInput.trim() || saving === "github_enterprise_slug"}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving === "github_enterprise_slug" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
          {data?.settings.github_enterprise_slug.configured && (
            <button
              onClick={() => handleDelete("github_enterprise_slug")}
              disabled={deleting === "github_enterprise_slug"}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
              title="Remove saved slug"
            >
              {deleting === "github_enterprise_slug" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* GitHub APIs Used */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">GitHub APIs Used</h2>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          This dashboard calls the following GitHub REST API endpoints. Ensure your PAT has the required scopes.
        </p>
        <div className="overflow-hidden rounded-md border border-gray-200 dark:border-gray-700">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Endpoint</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Purpose</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">API Version</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Classic PAT Scopes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              <tr>
                <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">GET /enterprises/{"{slug}"}/copilot/metrics/reports/users-28-day/latest</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">Enterprise user-level usage metrics (28-day)</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">2026-03-10</td>
                <td className="px-3 py-2"><code className="rounded-sm bg-gray-100 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">manage_billing:copilot</code></td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">GET /enterprises/{"{slug}"}/copilot/metrics/reports/users-1-day</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">Enterprise user-level usage metrics (specific day)</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">2026-03-10</td>
                <td className="px-3 py-2"><code className="rounded-sm bg-gray-100 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">manage_billing:copilot</code></td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">GET /orgs/{"{org}"}/copilot/metrics/reports/users-28-day/latest</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">Org user-level usage metrics (28-day)</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">2026-03-10</td>
                <td className="px-3 py-2"><code className="rounded-sm bg-gray-100 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">manage_billing:copilot</code> or <code className="rounded-sm bg-gray-100 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">read:org</code></td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">GET /orgs/{"{org}"}/copilot/metrics/reports/users-1-day</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">Org user-level usage metrics (specific day)</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">2026-03-10</td>
                <td className="px-3 py-2"><code className="rounded-sm bg-gray-100 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">manage_billing:copilot</code> or <code className="rounded-sm bg-gray-100 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">read:org</code></td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">GET /orgs/{"{org}"}/copilot/metrics/reports/organization-28-day/latest</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">Org aggregate metrics including PR summaries (28-day)</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">2026-03-10</td>
                <td className="px-3 py-2"><code className="rounded-sm bg-gray-100 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">manage_billing:copilot</code> or <code className="rounded-sm bg-gray-100 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">read:org</code></td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">GET /orgs/{"{org}"}/copilot/metrics/reports/organization-1-day</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">Org aggregate metrics including PR summaries (specific day)</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">2026-03-10</td>
                <td className="px-3 py-2"><code className="rounded-sm bg-gray-100 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">manage_billing:copilot</code> or <code className="rounded-sm bg-gray-100 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">read:org</code></td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">GET /enterprises/{"{slug}"}/copilot/billing/seats</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">Copilot seat assignments, license status, and activity</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">2026-03-10</td>
                <td className="px-3 py-2"><code className="rounded-sm bg-gray-100 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">manage_billing:copilot</code> or <code className="rounded-sm bg-gray-100 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">read:org</code></td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">GET /enterprises/{"{slug}"}/settings/billing/premium_request/usage</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">Premium request billing usage per user</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">2026-03-10</td>
                <td className="px-3 py-2"><code className="rounded-sm bg-gray-100 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">manage_billing:copilot</code></td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">GET /user/orgs</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">Discover organizations accessible to the token</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">2026-03-10</td>
                <td className="px-3 py-2"><code className="rounded-sm bg-gray-100 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">read:org</code></td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">GET /orgs/{"{org}"}/members</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">List organization members (enterprise user discovery)</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">2026-03-10</td>
                <td className="px-3 py-2"><code className="rounded-sm bg-gray-100 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">read:org</code></td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">GET /users/{"{login}"}</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">Resolve user display names (best-effort)</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">2026-03-10</td>
                <td className="px-3 py-2 text-gray-400 italic dark:text-gray-500">No scope required (public endpoint)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
          All endpoints use <code className="rounded-sm bg-gray-100 px-1 dark:bg-gray-700">Bearer</code> token authentication.
          For full coverage, the recommended classic PAT scopes are:{" "}
          <code className="rounded-sm bg-gray-100 px-1 dark:bg-gray-700">manage_billing:copilot</code>,{" "}
          <code className="rounded-sm bg-gray-100 px-1 dark:bg-gray-700">read:enterprise</code>,{" "}
          <code className="rounded-sm bg-gray-100 px-1 dark:bg-gray-700">read:org</code>.
        </p>
      </div>

    </div>
  );
}
