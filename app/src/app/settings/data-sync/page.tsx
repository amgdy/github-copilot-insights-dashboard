"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  Play,
  RefreshCw,
  Terminal,
  Upload,
  Clock,
  XCircle,
  FileDown,
  Save,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DatabaseZap,
  Square,
  Timer,
  Info,
} from "lucide-react";

interface SyncHistoryEntry {
  id: number;
  ingestionDate: string;
  source: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  recordsFetched: number | null;
  recordsInserted: number | null;
  recordsSkipped: number | null;
  errorMessage: string | null;
  apiRequests: number | null;
}

interface SettingsData {
  settings: {
    github_token: { configured: boolean };
    github_enterprise_slug: { configured: boolean };
  };
  envFallback: {
    github_token: boolean;
    github_enterprise_slug: string | null;
  };
}

interface SyncIntervalData {
  intervalMinutes: number;
  presetMinutes: number[];
  minInterval: number;
  maxInterval: number;
  note: string;
}

interface SchedulerStatus {
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
}

const PRESET_OPTIONS: { label: string; minutes: number }[] = [
  { label: "1 minute", minutes: 1 },
  { label: "5 minutes", minutes: 5 },
  { label: "15 minutes", minutes: 15 },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "6 hours", minutes: 360 },
  { label: "12 hours", minutes: 720 },
  { label: "24 hours", minutes: 1440 },
];

function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const SOURCE_LABELS: Record<string, { label: string; color: string; icon: typeof Play }> = {
  api: { label: "Manual (API)", color: "bg-blue-100 text-blue-700", icon: Play },
  scheduled: { label: "Scheduled", color: "bg-purple-100 text-purple-700", icon: Clock },
  file_upload: { label: "File Upload", color: "bg-amber-100 text-amber-700", icon: FileDown },
};

const STATUS_STYLES: Record<string, { color: string; icon: typeof CheckCircle }> = {
  success: { color: "text-green-600", icon: CheckCircle },
  error: { color: "text-red-600", icon: XCircle },
  running: { color: "text-blue-600", icon: Loader2 },
};

export default function DataSyncPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [history, setHistory] = useState<SyncHistoryEntry[]>([]);
  const [syncData, setSyncData] = useState<SyncIntervalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [ingestLogs, setIngestLogs] = useState<string[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync interval state
  const [isCustomInterval, setIsCustomInterval] = useState(false);
  const [selectedMinutes, setSelectedMinutes] = useState<number>(1440);
  const [customHours, setCustomHours] = useState(0);
  const [customMinutesInput, setCustomMinutesInput] = useState(0);
  const [savingInterval, setSavingInterval] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Scheduler state
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [togglingScheduler, setTogglingScheduler] = useState(false);
  const [countdown, setCountdown] = useState<string>("");

  // DB reset state
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  // History auto-refresh state
  const [autoRefreshHistory, setAutoRefreshHistory] = useState(true);
  const AUTO_REFRESH_INTERVAL_MS = 10000;

  // History pagination
  const [historyPage, setHistoryPage] = useState(0);
  const HISTORY_PAGE_SIZE = 10;

  const fetchData = useCallback(async () => {
    try {
      const [settingsRes, historyRes, intervalRes, scheduleRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/settings/sync-history"),
        fetch("/api/settings/sync-interval"),
        fetch("/api/settings/sync-schedule"),
      ]);
      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (historyRes.ok) {
        const data = await historyRes.json();
        setHistory(data.history ?? []);
      }
      if (intervalRes.ok) {
        const data: SyncIntervalData = await intervalRes.json();
        setSyncData(data);
        setSelectedMinutes(data.intervalMinutes);
        const isPreset = PRESET_OPTIONS.some((p) => p.minutes === data.intervalMinutes);
        setIsCustomInterval(!isPreset);
        if (!isPreset) {
          setCustomHours(Math.floor(data.intervalMinutes / 60));
          setCustomMinutesInput(data.intervalMinutes % 60);
        }
      }
      if (scheduleRes.ok) {
        const data: SchedulerStatus = await scheduleRes.json();
        setSchedulerStatus(data);
      }
    } catch (err) {
      console.error("Failed to fetch data sync info:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ingestLogs]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Guard to prevent stacking multiple fetchData calls from countdown tick
  const countdownPollRef = useRef(false);

  // Countdown timer — ticks every second when scheduler is enabled with a nextRunAt
  useEffect(() => {
    if (!schedulerStatus?.enabled || !schedulerStatus.nextRunAt) {
      setCountdown("");
      return;
    }
    countdownPollRef.current = false;
    const tick = () => {
      const diff = new Date(schedulerStatus.nextRunAt!).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown("Syncing now\u2026");
        // Refresh once to pick up the new nextRunAt set by the scheduler
        if (!countdownPollRef.current) {
          countdownPollRef.current = true;
          setTimeout(async () => {
            await fetchData();
            countdownPollRef.current = false;
          }, 3000);
        }
        return;
      }
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      const parts: string[] = [];
      if (hrs > 0) parts.push(`${hrs}h`);
      if (mins > 0 || hrs > 0) parts.push(`${mins}m`);
      parts.push(`${secs}s`);
      setCountdown(parts.join(" "));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [schedulerStatus?.enabled, schedulerStatus?.nextRunAt, fetchData]);

  // Auto-refresh history and scheduler status
  useEffect(() => {
    if (!autoRefreshHistory) return;
    const id = setInterval(async () => {
      try {
        const [historyRes, scheduleRes] = await Promise.all([
          fetch("/api/settings/sync-history"),
          fetch("/api/settings/sync-schedule"),
        ]);
        if (historyRes.ok) {
          const data = await historyRes.json();
          setHistory(data.history ?? []);
        }
        if (scheduleRes.ok) {
          const data: SchedulerStatus = await scheduleRes.json();
          setSchedulerStatus(data);
        }
      } catch {
        // silently skip refresh errors
      }
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRefreshHistory]);

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const isConfigured =
    settings?.settings.github_token.configured ||
    settings?.envFallback.github_token ||
    false;
  const hasSlug =
    settings?.settings.github_enterprise_slug.configured ||
    !!settings?.envFallback.github_enterprise_slug;

  const effectiveMinutes = isCustomInterval
    ? customHours * 60 + customMinutesInput
    : selectedMinutes;

  const currentDisplayLabel = isCustomInterval
    ? formatInterval(effectiveMinutes)
    : PRESET_OPTIONS.find((p) => p.minutes === selectedMinutes)?.label ?? formatInterval(selectedMinutes);

  const handleSelectPreset = (minutes: number) => {
    setIsCustomInterval(false);
    setSelectedMinutes(minutes);
    setShowDropdown(false);
  };

  const handleSelectCustom = () => {
    setIsCustomInterval(true);
    setCustomHours(Math.floor(selectedMinutes / 60));
    setCustomMinutesInput(selectedMinutes % 60);
    setShowDropdown(false);
  };

  const handleSaveInterval = async () => {
    const minutes = isCustomInterval ? customHours * 60 + customMinutesInput : selectedMinutes;
    if (minutes < (syncData?.minInterval ?? 1) || minutes > (syncData?.maxInterval ?? 1440)) {
      showMessage("error", `Interval must be between ${syncData?.minInterval ?? 1} and ${syncData?.maxInterval ?? 1440} minutes`);
      return;
    }
    setSavingInterval(true);
    try {
      const res = await fetch("/api/settings/sync-interval", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalMinutes: minutes }),
      });
      if (res.ok) {
        const result = await res.json();
        showMessage("success", result.message ?? `Sync interval set to ${formatInterval(minutes)}`);
        await fetchData();
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

  const handleToggleScheduler = async () => {
    const newAction = schedulerStatus?.enabled ? "stop" : "start";
    setTogglingScheduler(true);
    try {
      const minutes = isCustomInterval ? customHours * 60 + customMinutesInput : selectedMinutes;
      const res = await fetch("/api/settings/sync-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: newAction,
          ...(newAction === "start" ? { intervalMinutes: minutes } : {}),
        }),
      });
      if (res.ok) {
        const result = await res.json();
        showMessage("success", result.message);
        await fetchData();
      } else {
        const err = await res.json();
        showMessage("error", err.error ?? `Failed to ${newAction} scheduler`);
      }
    } catch {
      showMessage("error", "Network error");
    } finally {
      setTogglingScheduler(false);
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
        await fetchData();
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

  const readSSEStream = async (res: Response) => {
    const reader = res.body?.getReader();
    if (!reader) {
      showMessage("error", "Unable to read stream");
      setIngesting(false);
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const match = line.match(/^data: (.+)$/);
        if (!match) continue;
        try {
          const event = JSON.parse(match[1]);
          if (event.type === "log") {
            setIngestLogs((prev) => [...prev, event.message]);
          } else if (event.type === "done") {
            const result = JSON.parse(event.message);
            const apiInfo = result.apiRequests ? `, ${result.apiRequests} API requests` : "";
            const skipInfo = result.recordsSkipped ? `, ${result.recordsSkipped} duplicates skipped` : "";
            setIngestLogs((prev) => [
              ...prev,
              `✓ Complete — ${result.recordsFetched} fetched, ${result.recordsInserted} inserted${skipInfo}${apiInfo}`,
            ]);
            const skipMsg = result.recordsSkipped ? `, ${result.recordsSkipped} duplicates skipped` : "";
            showMessage(
              "success",
              `Ingestion complete — ${result.recordsFetched} records fetched, ${result.recordsInserted} inserted${skipMsg}.`
            );
          } else if (event.type === "error") {
            setIngestLogs((prev) => [...prev, `✗ ERROR: ${event.message}`]);
            showMessage("error", event.message);
          }
        } catch {
          // skip malformed events
        }
      }
    }
  };

  const handleIngest = async () => {
    setShowConfirm(false);
    setIngesting(true);
    setIngestLogs([]);

    try {
      const res = await fetch("/api/ingest/stream", { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        showMessage("error", err.error ?? "Ingestion failed");
        setIngesting(false);
        return;
      }
      await readSSEStream(res);
    } catch {
      showMessage("error", "Network error during ingestion");
      setIngestLogs((prev) => [...prev, "✗ Network error"]);
    } finally {
      setIngesting(false);
      fetchData(); // refresh history
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;
    setIngesting(true);
    setIngestLogs([]);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("/api/ingest/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const err = await res.json();
          showMessage("error", err.error ?? "File upload failed");
        } else {
          showMessage("error", "File upload failed");
        }
        setIngesting(false);
        return;
      }

      await readSSEStream(res);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      showMessage("error", "Network error during file upload");
      setIngestLogs((prev) => [...prev, "✗ Network error"]);
    } finally {
      setIngesting(false);
      fetchData(); // refresh history
    }
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const fmtDuration = (start: string, end: string | null) => {
    if (!end) return "—";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    const secs = Math.round(ms / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
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

      {/* About Data Sync */}
      <div className="flex gap-3 rounded-lg border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
        <div>
          <p className="text-sm font-medium text-blue-900">How data sync works</p>
          <p className="mt-1 text-xs leading-relaxed text-blue-700">
            The GitHub Copilot Metrics API refreshes data approximately once every 24 hours (end of UTC day).
            You can schedule automatic syncs, trigger a one-time pull, or upload an NDJSON metrics export.
            Duplicate records are automatically detected and skipped.
          </p>
        </div>
      </div>

      {/* GitHub API Sync */}
      <div className="rounded-lg border border-gray-200 bg-white">
        {/* Countdown bar — only when scheduler running */}
        {schedulerStatus?.enabled && schedulerStatus.nextRunAt && (
          <div className="rounded-t-lg border-b border-blue-100 bg-blue-50 px-5 py-2">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 text-blue-700">
                <Timer className="h-3.5 w-3.5" />
                <span className="font-medium">Next sync in:</span>
                <span className="tabular-nums font-semibold">{countdown || "—"}</span>
                <span className="text-blue-500">({new Date(schedulerStatus.nextRunAt).toLocaleTimeString()})</span>
              </div>
              {schedulerStatus.lastRunAt && (
                <div className="flex items-center gap-1.5 text-blue-600">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="font-medium">Last run:</span>
                  <span>{new Date(schedulerStatus.lastRunAt).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="p-5">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900">GitHub API Sync</h2>
            {schedulerStatus?.enabled && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Scheduled
              </span>
            )}
          </div>
          <p className="mb-4 text-xs text-gray-500">
            Pull usage metrics from the GitHub Copilot API — once now, or on a recurring schedule.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Sync Now */}
            <div className="rounded-md border border-gray-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Play className="h-4 w-4 text-green-600" />
                <h3 className="text-sm font-medium text-gray-900">Sync Now</h3>
              </div>
              <p className="mb-3 text-xs text-gray-500">
                One-time pull of the latest metrics from the GitHub API.
              </p>
              <button
                onClick={() => setShowConfirm(true)}
                disabled={ingesting || !isConfigured || !hasSlug}
                className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {ingesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {ingesting ? "Syncing…" : "Pull from API"}
              </button>
              {!isConfigured && (
                <p className="mt-2 text-xs text-amber-600">
                  Configure a GitHub token in the Configuration tab first.
                </p>
              )}
              {isConfigured && !hasSlug && (
                <p className="mt-2 text-xs text-amber-600">
                  Configure an enterprise slug in the Configuration tab first.
                </p>
              )}
            </div>

            {/* Scheduled Sync */}
            <div className="rounded-md border border-gray-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-purple-600" />
                  <h3 className="text-sm font-medium text-gray-900">Scheduled Sync</h3>
                </div>
                <button
                  onClick={handleToggleScheduler}
                  disabled={togglingScheduler}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    schedulerStatus?.enabled
                      ? "border border-red-300 bg-white text-red-600 hover:bg-red-50"
                      : "bg-green-600 text-white hover:bg-green-700"
                  }`}
                >
                  {togglingScheduler ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : schedulerStatus?.enabled ? (
                    <Square className="h-3 w-3" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  {schedulerStatus?.enabled ? "Stop" : "Start"}
                </button>
              </div>
              <p className="mb-3 text-xs text-gray-500">
                Automatically pull fresh data at a recurring interval.
              </p>
              <div className="flex items-start gap-2">
                <div ref={dropdownRef} className="relative flex-1">
                  <button
                    type="button"
                    onClick={() => setShowDropdown(!showDropdown)}
                    className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <span className="text-gray-900">
                      {isCustomInterval ? `Custom (${formatInterval(effectiveMinutes)})` : currentDisplayLabel}
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </button>
                  {showDropdown && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                      {PRESET_OPTIONS.map((opt) => (
                        <button
                          key={opt.minutes}
                          onClick={() => handleSelectPreset(opt.minutes)}
                          className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors ${
                            !isCustomInterval && selectedMinutes === opt.minutes
                              ? "bg-blue-50 text-blue-700 font-medium"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                      <div className="my-1 border-t border-gray-100" />
                      <button
                        onClick={handleSelectCustom}
                        className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors ${
                          isCustomInterval
                            ? "bg-blue-50 text-blue-700 font-medium"
                            : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        Custom...
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleSaveInterval}
                  disabled={savingInterval || effectiveMinutes === syncData?.intervalMinutes}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingInterval ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </button>
              </div>
              {isCustomInterval && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={24}
                      value={customHours}
                      onChange={(e) => setCustomHours(Math.max(0, Math.min(24, parseInt(e.target.value) || 0)))}
                      className="w-14 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-center shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-500">h</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={customMinutesInput}
                      onChange={(e) => setCustomMinutesInput(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                      className="w-14 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-center shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-500">m</span>
                  </div>
                </div>
              )}
              {isCustomInterval && effectiveMinutes < (syncData?.minInterval ?? 1) && (
                <p className="mt-2 text-xs text-red-600">
                  Minimum interval is {syncData?.minInterval ?? 1} minute(s).
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* File Upload */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-1 flex items-center gap-2">
          <Upload className="h-4 w-4 text-amber-600" />
          <h2 className="text-sm font-semibold text-gray-900">File Upload</h2>
        </div>
        <p className="mb-3 text-xs text-gray-500">
          Upload an NDJSON file exported from the GitHub Copilot usage metrics report.
        </p>
        <div
          className={`relative rounded-md border-2 border-dashed p-6 text-center transition-colors ${
            dragOver
              ? "border-blue-400 bg-blue-50"
              : selectedFile
                ? "border-green-300 bg-green-50"
                : "border-gray-300 hover:border-gray-400"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) setSelectedFile(file);
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.ndjson,.jsonl"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setSelectedFile(file);
            }}
          />
          <Upload className="mx-auto h-8 w-8 text-gray-400" />
          {selectedFile ? (
            <p className="mt-2 text-sm font-medium text-green-700">
              {selectedFile.name}{" "}
              <span className="text-xs text-gray-500">
                ({(selectedFile.size / 1024).toFixed(1)} KB)
              </span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-gray-500">
              Drag &amp; drop an NDJSON file or click to browse
            </p>
          )}
          <p className="mt-1 text-xs text-gray-400">
            Supports .json, .ndjson, .jsonl files
          </p>
        </div>
        <button
          onClick={handleFileUpload}
          disabled={ingesting || !selectedFile}
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ingesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {ingesting ? "Uploading…" : "Upload & Ingest"}
        </button>
      </div>

      {/* Ingestion Log */}
      {ingestLogs.length > 0 && (
        <div className="rounded-md border border-gray-300 bg-gray-900">
          <div className="flex items-center gap-2 border-b border-gray-700 px-3 py-2">
            <Terminal className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xs font-medium text-gray-400">Ingestion Log</span>
            {ingesting && <Loader2 className="ml-auto h-3 w-3 animate-spin text-green-400" />}
          </div>
          <div className="max-h-64 overflow-y-auto p-3 font-mono text-xs leading-5">
            {ingestLogs.map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith("✗")
                    ? "text-red-400"
                    : line.startsWith("✓")
                      ? "text-green-400"
                      : "text-gray-300"
                }
              >
                {line}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Start data ingestion?</h3>
            <p className="mt-2 text-sm text-gray-600">
              This will fetch Copilot usage data from the GitHub API and load it into the database.
              This may take a few minutes depending on data volume.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleIngest}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Confirm &amp; Ingest
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync History */}
      {(() => {
        const totalPages = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
        const safePage = Math.min(historyPage, totalPages - 1);
        const pageStart = safePage * HISTORY_PAGE_SIZE;
        const pageEntries = history.slice(pageStart, pageStart + HISTORY_PAGE_SIZE);

        return (
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Sync History</h2>
                <p className="text-xs text-gray-500">
                  {history.length === 0
                    ? "No runs recorded yet"
                    : `${history.length} run${history.length !== 1 ? "s" : ""} recorded`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAutoRefreshHistory((v) => !v)}
                  title={autoRefreshHistory ? "Pause auto-refresh" : "Resume auto-refresh"}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    autoRefreshHistory
                      ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                      : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <RefreshCw className={`h-3 w-3 ${autoRefreshHistory ? "animate-spin" : ""}`} />
                  {autoRefreshHistory ? "Live" : "Paused"}
                </button>
                <button
                  onClick={() => fetchData()}
                  title="Refresh now"
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
              </div>
            </div>

            {history.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Clock className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">No sync history yet</p>
                <p className="text-xs text-gray-400">Run your first ingestion above to get started</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-gray-100">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-2 px-5 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">
                    <div className="col-span-3">Date</div>
                    <div className="col-span-2">Source</div>
                    <div className="col-span-1">Status</div>
                    <div className="col-span-2 text-right">Records</div>
                    <div className="col-span-1 text-right">Skipped</div>
                    <div className="col-span-1 text-right">Duration</div>
                    <div className="col-span-2 text-right">API Calls</div>
                  </div>

                  {pageEntries.map((entry) => {
                    const source = SOURCE_LABELS[entry.source] ?? SOURCE_LABELS.api;
                    const statusStyle = STATUS_STYLES[entry.status] ?? STATUS_STYLES.running;
                    const StatusIcon = statusStyle.icon;
                    const isExpanded = expandedRow === entry.id;

                    return (
                      <div key={entry.id}>
                        <button
                          className="grid w-full grid-cols-12 gap-2 px-5 py-3 text-left text-sm hover:bg-gray-50 transition-colors"
                          onClick={() => setExpandedRow(isExpanded ? null : entry.id)}
                        >
                          <div className="col-span-3 text-gray-900">
                            {fmtDate(entry.startedAt)}
                          </div>
                          <div className="col-span-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${source.color}`}>
                              {source.label}
                            </span>
                          </div>
                          <div className="col-span-1">
                            <StatusIcon
                              className={`h-4 w-4 ${statusStyle.color} ${entry.status === "running" ? "animate-spin" : ""}`}
                            />
                          </div>
                          <div className="col-span-2 text-right text-gray-700">
                            {entry.recordsInserted != null ? (
                              <span>
                                {entry.recordsFetched?.toLocaleString()} → {entry.recordsInserted.toLocaleString()}
                              </span>
                            ) : (
                              "—"
                            )}
                          </div>
                          <div className="col-span-1 text-right text-gray-500">
                            {entry.recordsSkipped ? entry.recordsSkipped.toLocaleString() : "—"}
                          </div>
                          <div className="col-span-1 text-right text-gray-600">
                            {fmtDuration(entry.startedAt, entry.completedAt)}
                          </div>
                          <div className="col-span-2 text-right text-gray-600">
                            {entry.apiRequests ?? "—"}
                          </div>
                        </button>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div className="border-t border-gray-100 bg-gray-50 px-5 py-3">
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                              <div>
                                <dt className="font-medium text-gray-500">Started At</dt>
                                <dd className="text-gray-900">{new Date(entry.startedAt).toLocaleString()}</dd>
                              </div>
                              <div>
                                <dt className="font-medium text-gray-500">Completed At</dt>
                                <dd className="text-gray-900">
                                  {entry.completedAt ? new Date(entry.completedAt).toLocaleString() : "In progress…"}
                                </dd>
                              </div>
                              <div>
                                <dt className="font-medium text-gray-500">Records Fetched</dt>
                                <dd className="text-gray-900">{entry.recordsFetched?.toLocaleString() ?? "—"}</dd>
                              </div>
                              <div>
                                <dt className="font-medium text-gray-500">Records Inserted</dt>
                                <dd className="text-gray-900">{entry.recordsInserted?.toLocaleString() ?? "—"}</dd>
                              </div>
                              <div>
                                <dt className="font-medium text-gray-500">Duplicates Skipped</dt>
                                <dd className="text-gray-900">{entry.recordsSkipped?.toLocaleString() ?? "—"}</dd>
                              </div>
                              <div>
                                <dt className="font-medium text-gray-500">Source</dt>
                                <dd className="text-gray-900">{source.label}</dd>
                              </div>
                              <div>
                                <dt className="font-medium text-gray-500">API Requests</dt>
                                <dd className="text-gray-900">{entry.apiRequests ?? "N/A"}</dd>
                              </div>
                              {entry.errorMessage && (
                                <div className="col-span-2">
                                  <dt className="font-medium text-red-600">Error</dt>
                                  <dd className="mt-1 rounded-md bg-red-50 p-2 text-red-700 font-mono text-xs whitespace-pre-wrap">
                                    {entry.errorMessage}
                                  </dd>
                                </div>
                              )}
                            </dl>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Pagination footer */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-gray-100 px-5 py-2.5">
                    <p className="text-xs text-gray-500">
                      Showing {pageStart + 1}–{Math.min(pageStart + HISTORY_PAGE_SIZE, history.length)} of {history.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                        disabled={safePage === 0}
                        className="inline-flex items-center rounded-md border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <span className="px-2 text-xs tabular-nums text-gray-700">
                        {safePage + 1} / {totalPages}
                      </span>
                      <button
                        onClick={() => setHistoryPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={safePage >= totalPages - 1}
                        className="inline-flex items-center rounded-md border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

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
