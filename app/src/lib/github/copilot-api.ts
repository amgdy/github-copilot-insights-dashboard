/**
 * GitHub Copilot Usage Metrics API client.
 *
 * Fetches data from the latest Copilot Usage Metrics endpoints (API version 2026-03-10).
 * Uses a two-step process: get download links, then download NDJSON report files.
 */

import { CopilotUsageRecord, CopilotMetricsReportResponse } from "@/types/copilot-api";

const GITHUB_API_BASE = "https://api.github.com";
const API_VERSION = "2026-03-10";
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1000;

interface FetchOptions {
  enterpriseSlug: string;
  token: string;
  /** Specific day in YYYY-MM-DD format. If omitted, uses the latest 28-day report. */
  day?: string;
}

interface FetchResult {
  records: CopilotUsageRecord[];
  apiRequestCount: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildReportUrl(opts: FetchOptions): string {
  const slug = encodeURIComponent(opts.enterpriseSlug);

  if (opts.day) {
    // Specific day report
    const url = new URL(
      `${GITHUB_API_BASE}/enterprises/${slug}/copilot/metrics/reports/users-1-day`
    );
    url.searchParams.set("day", opts.day);
    return url.toString();
  }

  // Latest 28-day report
  return `${GITHUB_API_BASE}/enterprises/${slug}/copilot/metrics/reports/users-28-day/latest`;
}

async function fetchWithRetry(
  url: string,
  token: string,
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": API_VERSION,
        },
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : INITIAL_BACKOFF_MS * Math.pow(2, attempt);

        console.warn(
          `Rate limited. Waiting ${waitMs}ms before retry ${attempt + 1}/${retries}`
        );
        await sleep(waitMs);
        continue;
      }

      if (response.status >= 500) {
        const waitMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(
          `Server error ${response.status}. Waiting ${waitMs}ms before retry ${attempt + 1}/${retries}`
        );
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        throw new Error(
          `GitHub API error: ${response.status} ${response.statusText}`
        );
      }

      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries - 1) {
        const waitMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(
          `Request failed: ${lastError.message}. Retrying in ${waitMs}ms (${attempt + 1}/${retries})`
        );
        await sleep(waitMs);
      }
    }
  }

  throw lastError ?? new Error("Request failed after retries");
}

/**
 * Fetches all Copilot usage records for the given enterprise.
 *
 * Uses the new two-step Copilot Usage Metrics API:
 * 1. Calls the report endpoint to get signed download links
 * 2. Downloads NDJSON files from those links and parses them
 */
export async function fetchCopilotUsage(
  opts: Omit<FetchOptions, "page" | "perPage">
): Promise<FetchResult> {
  let apiRequestCount = 0;

  console.info(
    `Fetching Copilot usage for enterprise "${opts.enterpriseSlug}" ` +
    `(day: ${opts.day ?? "latest 28-day"})`
  );

  // Step 1: Get download links from the report endpoint
  const reportUrl = buildReportUrl(opts);
  const reportResponse = await fetchWithRetry(reportUrl, opts.token);
  apiRequestCount++;

  const reportData: CopilotMetricsReportResponse = await reportResponse.json();

  if (!reportData.download_links || reportData.download_links.length === 0) {
    console.info("No download links returned from the Copilot metrics API.");
    return { records: [], apiRequestCount };
  }

  console.info(
    `Got ${reportData.download_links.length} download link(s) ` +
    `(report: ${reportData.report_day ?? `${reportData.report_start_day} to ${reportData.report_end_day}`})`
  );

  // Step 2: Download and parse NDJSON files from each link
  const allRecords: CopilotUsageRecord[] = [];

  for (let i = 0; i < reportData.download_links.length; i++) {
    const link = reportData.download_links[i];
    console.info(`Downloading report file ${i + 1}/${reportData.download_links.length}...`);

    // Download links are pre-signed URLs — no auth header needed
    const fileResponse = await fetch(link);
    apiRequestCount++;

    if (!fileResponse.ok) {
      console.warn(`Failed to download report file ${i + 1}: ${fileResponse.status} ${fileResponse.statusText}`);
      continue;
    }

    const content = await fileResponse.text();
    const parsed = parseNdjson(content);
    allRecords.push(...parsed);
    console.info(`File ${i + 1}: parsed ${parsed.length} records (total: ${allRecords.length})`);
  }

  console.info(
    `Completed: ${allRecords.length} records fetched in ${apiRequestCount} API requests`
  );

  return { records: allRecords, apiRequestCount };
}

/**
 * Parse NDJSON content (one JSON object per line) into typed records.
 */
export function parseNdjson(content: string): CopilotUsageRecord[] {
  return content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as CopilotUsageRecord;
      } catch (err) {
        console.error(`Failed to parse NDJSON line ${index + 1}: ${err}`);
        return null;
      }
    })
    .filter((record): record is CopilotUsageRecord => record !== null);
}
