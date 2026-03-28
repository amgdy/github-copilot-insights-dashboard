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
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {/* Info */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-medium">How settings are resolved</p>
        <p className="mt-1 text-xs text-blue-700">
          Configure your GitHub token and enterprise slug here. Settings are stored securely in the database.
        </p>
      </div>

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
          Classic token scopes: <code className="rounded-sm bg-gray-100 px-1">manage_billing:copilot</code> (read),{" "}
          <code className="rounded-sm bg-gray-100 px-1">read:enterprise</code>,{" "}
          <code className="rounded-sm bg-gray-100 px-1">read:org</code>,{" "}
          <code className="rounded-sm bg-gray-100 px-1">read:user</code>.{" "}
          Fine-grained: <code className="rounded-sm bg-gray-100 px-1">Enterprise Copilot metrics</code> (read).{" "}
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
            Current: <code className="rounded-sm bg-gray-100 px-1">{data.settings.github_token.masked}</code>
          </p>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showToken ? "text" : "password"}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder={data?.settings.github_token.configured ? "Enter new token to update" : "ghp_xxxxxxxxxxxx"}
              className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm shadow-xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
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
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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

        <div className="flex gap-2">
          <input
            type="text"
            value={slugInput}
            onChange={(e) => setSlugInput(e.target.value)}
            placeholder="my-enterprise"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
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
              className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              title="Remove saved slug"
            >
              {deleting === "github_enterprise_slug" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

    </div>
  );
}
