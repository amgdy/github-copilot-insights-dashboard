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
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [ingestLogs, setIngestLogs] = useState<string[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [ingestMode, setIngestMode] = useState<"api" | "file">("api");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const [settingsRes, historyRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/settings/sync-history"),
      ]);
      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (historyRes.ok) {
        const data = await historyRes.json();
        setHistory(data.history ?? []);
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
            setIngestLogs((prev) => [
              ...prev,
              `✓ Complete — ${result.recordsFetched} fetched, ${result.recordsInserted} inserted${apiInfo}`,
            ]);
            showMessage(
              "success",
              `Ingestion complete — ${result.recordsFetched} records fetched, ${result.recordsInserted} inserted.`
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

      {/* Data Ingestion */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Data Ingestion</h2>
        </div>
        <p className="mb-4 text-xs text-gray-500">
          Load Copilot usage data into the dashboard. Choose your ingestion method.
        </p>

        {/* Tabs */}
        <div className="mb-4 flex border-b border-gray-200">
          <button
            onClick={() => setIngestMode("api")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              ingestMode === "api"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Play className="mr-1.5 inline h-3.5 w-3.5" />
            Pull from GitHub API
          </button>
          <button
            onClick={() => setIngestMode("file")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              ingestMode === "file"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Upload className="mr-1.5 inline h-3.5 w-3.5" />
            Upload Metrics File
          </button>
        </div>

        {/* API Pull Mode */}
        {ingestMode === "api" && (
          <div className="rounded-md border border-gray-200 p-4">
            <p className="mb-3 text-xs text-gray-500">
              Fetch the latest metrics directly from GitHub using your PAT and enterprise slug.
            </p>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={ingesting || !isConfigured || !hasSlug}
              className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ingesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {ingesting ? "Ingesting…" : "Pull from API"}
            </button>
            {!isConfigured && (
              <p className="mt-2 text-xs text-amber-600">
                Configure a GitHub token in the Configuration tab before ingesting.
              </p>
            )}
            {isConfigured && !hasSlug && (
              <p className="mt-2 text-xs text-amber-600">
                Configure an enterprise slug in the Configuration tab before ingesting.
              </p>
            )}
          </div>
        )}

        {/* File Upload Mode */}
        {ingestMode === "file" && (
          <div className="rounded-md border border-gray-200 p-4">
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
        )}

        {/* Ingestion Log Panel */}
        {ingestLogs.length > 0 && (
          <div className="mt-4 rounded-md border border-gray-300 bg-gray-900">
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
      </div>

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
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Sync History</h2>
            <p className="text-xs text-gray-500">Log of all data sync and import operations</p>
          </div>
          <button
            onClick={() => fetchData()}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>

        {history.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            No sync history yet. Run your first data ingestion above.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 px-5 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">
              <div className="col-span-3">Date</div>
              <div className="col-span-2">Source</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-2 text-right">Records</div>
              <div className="col-span-2 text-right">Duration</div>
              <div className="col-span-2 text-right">API Calls</div>
            </div>

            {history.map((entry) => {
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
                    <div className="col-span-2 text-right text-gray-600">
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
        )}
      </div>

      {/* Info Note */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-medium">About data sync</p>
        <p className="mt-1 text-xs text-blue-700">
          The GitHub Copilot Metrics API refreshes data approximately once every 24 hours (end of UTC day).
          Automatic sync runs on the schedule configured in the Configuration tab.
          You can also trigger a manual sync or upload an NDJSON metrics export file at any time.
        </p>
      </div>
    </div>
  );
}
