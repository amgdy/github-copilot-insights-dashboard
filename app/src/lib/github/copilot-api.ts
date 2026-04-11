/**
 * GitHub Copilot Usage Metrics API client.
 *
 * Fetches data from the latest Copilot Usage Metrics endpoints (API version 2026-03-10).
 * Supports both enterprise-level and organization-level data fetching.
 * Uses a two-step process: get download links, then download NDJSON report files.
 */

import type {
  CopilotUsageRecord,
  CopilotMetricsReportResponse,
  CopilotAggregateRecord,
  EnterpriseOrg,
} from "@/types/copilot-api";

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

interface OrgFetchOptions {
  orgLogin: string;
  token: string;
  /** Specific day in YYYY-MM-DD format. If omitted, uses the latest 28-day report. */
  day?: string;
}

interface FetchResult {
  records: CopilotUsageRecord[];
  apiRequestCount: number;
}

interface AggregateResult {
  records: CopilotAggregateRecord[];
  apiRequestCount: number;
}

interface MultiOrgResult {
  records: CopilotUsageRecord[];
  aggregateRecords: CopilotAggregateRecord[];
  orgs: EnterpriseOrg[];
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

function buildOrgUserReportUrl(opts: OrgFetchOptions): string {
  const org = encodeURIComponent(opts.orgLogin);

  if (opts.day) {
    const url = new URL(
      `${GITHUB_API_BASE}/orgs/${org}/copilot/metrics/reports/users-1-day`
    );
    url.searchParams.set("day", opts.day);
    return url.toString();
  }

  return `${GITHUB_API_BASE}/orgs/${org}/copilot/metrics/reports/users-28-day/latest`;
}

function buildOrgAggregateReportUrl(opts: OrgFetchOptions): string {
  const org = encodeURIComponent(opts.orgLogin);

  if (opts.day) {
    const url = new URL(
      `${GITHUB_API_BASE}/orgs/${org}/copilot/metrics/reports/organization-1-day`
    );
    url.searchParams.set("day", opts.day);
    return url.toString();
  }

  return `${GITHUB_API_BASE}/orgs/${org}/copilot/metrics/reports/organization-28-day/latest`;
}

async function fetchWithRetry(
  url: string,
  token: string,
  retries = MAX_RETRIES,
  apiVersion = API_VERSION
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": apiVersion,
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
        if (response.status === 403) {
          const body = await response.text().catch(() => "");
          throw new Error(
            `GitHub API returned 403 Forbidden. Your Personal Access Token (PAT) may not have the required scopes. ` +
            `Please ensure it has: manage_billing:copilot (read) or manage_billing:enterprise (read). ` +
            `You can update token scopes at https://github.com/settings/tokens. Details: ${body}`
          );
        }
        if (response.status === 404) {
          throw new Error(
            `GitHub API returned 404 Not Found. This may indicate the enterprise slug is incorrect ` +
            `or your PAT does not have access to this enterprise. Please verify the enterprise slug ` +
            `in Settings and ensure your token has the required scopes.`
          );
        }
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
export function parseNdjson<T = CopilotUsageRecord>(content: string): T[] {
  return content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch (err) {
        console.error(`Failed to parse NDJSON line ${index + 1}: ${err}`);
        return null;
      }
    })
    .filter((record): record is T => record !== null);
}

/**
 * Lists all organizations in an enterprise (paginated).
 */
export async function listEnterpriseOrgs(opts: {
  enterpriseSlug: string;
  token: string;
}): Promise<{ orgs: EnterpriseOrg[]; apiRequestCount: number }> {
  let apiRequestCount = 0;
  const allOrgs: EnterpriseOrg[] = [];
  let page = 1;
  const perPage = 100;

  console.info(`Discovering organizations for enterprise "${opts.enterpriseSlug}"…`);

  // Use GET /user/orgs — lists all orgs the authenticated token has access to.
  // Requires `read:org` scope for classic PATs, or no special permissions for fine-grained tokens.
  while (true) {
    const url = `${GITHUB_API_BASE}/user/orgs?per_page=${perPage}&page=${page}`;
    const response = await fetchWithRetry(url, opts.token, MAX_RETRIES);
    apiRequestCount++;

    const orgs: EnterpriseOrg[] = await response.json();
    allOrgs.push(...orgs);

    if (orgs.length < perPage) break;
    page++;
  }

  console.info(`Found ${allOrgs.length} organization(s) accessible to the token`);
  return { orgs: allOrgs, apiRequestCount };
}

export interface OrgMember {
  login: string;
  id: number;
  avatar_url: string;
  type: string;
  site_admin: boolean;
  org_login: string;
}

/**
 * Lists all members of a single organization (paginated).
 * Requires `read:org` scope for classic PATs.
 */
export async function listOrgMembers(opts: {
  orgLogin: string;
  token: string;
}): Promise<{ members: OrgMember[]; apiRequestCount: number }> {
  let apiRequestCount = 0;
  const allMembers: OrgMember[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `${GITHUB_API_BASE}/orgs/${encodeURIComponent(opts.orgLogin)}/members?per_page=${perPage}&page=${page}`;
    const response = await fetchWithRetry(url, opts.token, MAX_RETRIES);
    apiRequestCount++;

    const members = await response.json();
    for (const m of members) {
      allMembers.push({
        login: m.login,
        id: m.id,
        avatar_url: m.avatar_url,
        type: m.type || "User",
        site_admin: m.site_admin || false,
        org_login: opts.orgLogin,
      });
    }

    if (members.length < perPage) break;
    page++;
  }

  return { members: allMembers, apiRequestCount };
}

/**
 * Lists all unique members across all organizations in an enterprise.
 * Deduplicates by login — first org encountered wins for org attribution.
 */
export async function listEnterpriseMembers(opts: {
  enterpriseSlug: string;
  token: string;
  /** If provided, only fetch members from these orgs. */
  orgLogins?: string[];
}): Promise<{ members: OrgMember[]; apiRequestCount: number }> {
  let apiRequestCount = 0;

  // Step 1: Discover orgs
  let orgs: EnterpriseOrg[];
  if (opts.orgLogins?.length) {
    orgs = opts.orgLogins.map((login) => ({ login, id: 0 }));
  } else {
    const result = await listEnterpriseOrgs({
      enterpriseSlug: opts.enterpriseSlug,
      token: opts.token,
    });
    orgs = result.orgs;
    apiRequestCount += result.apiRequestCount;
  }

  // Step 2: Fetch members from each org, deduplicate
  const seenLogins = new Set<string>();
  const allMembers: OrgMember[] = [];

  for (const org of orgs) {
    console.info(`Fetching members for org "${org.login}"…`);
    const result = await listOrgMembers({ orgLogin: org.login, token: opts.token });
    apiRequestCount += result.apiRequestCount;

    for (const member of result.members) {
      if (!seenLogins.has(member.login)) {
        seenLogins.add(member.login);
        allMembers.push(member);
      }
    }
  }

  console.info(`Enterprise member discovery: ${allMembers.length} unique members from ${orgs.length} org(s)`);
  return { members: allMembers, apiRequestCount };
}

/**
 * Fetches org-level user data and aggregate data (with PR metrics) for a single org.
 */
async function fetchOrgData(opts: OrgFetchOptions): Promise<{
  userRecords: CopilotUsageRecord[];
  aggregateRecords: CopilotAggregateRecord[];
  apiRequestCount: number;
}> {
  let apiRequestCount = 0;
  const userRecords: CopilotUsageRecord[] = [];
  const aggregateRecords: CopilotAggregateRecord[] = [];

  // 1. Fetch org user-level data
  const userUrl = buildOrgUserReportUrl(opts);
  try {
    const userResponse = await fetchWithRetry(userUrl, opts.token);
    apiRequestCount++;

    const reportData: CopilotMetricsReportResponse = await userResponse.json();

    if (reportData.download_links?.length) {
      for (const link of reportData.download_links) {
        const fileResponse = await fetch(link);
        apiRequestCount++;
        if (fileResponse.ok) {
          const content = await fileResponse.text();
          const parsed = parseNdjson<CopilotUsageRecord>(content);
          // Tag records with org login
          for (const r of parsed) {
            r._orgLogin = opts.orgLogin;
          }
          userRecords.push(...parsed);
        }
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch user data for org "${opts.orgLogin}": ${err}`);
  }

  // 2. Fetch org aggregate data (includes PR metrics)
  const aggUrl = buildOrgAggregateReportUrl(opts);
  try {
    const aggResponse = await fetchWithRetry(aggUrl, opts.token);
    apiRequestCount++;

    const aggReportData: CopilotMetricsReportResponse = await aggResponse.json();

    if (aggReportData.download_links?.length) {
      for (const link of aggReportData.download_links) {
        const fileResponse = await fetch(link);
        apiRequestCount++;
        if (fileResponse.ok) {
          const content = await fileResponse.text();
          const parsed = parseNdjson<CopilotAggregateRecord>(content);
          for (const r of parsed) {
            r._orgLogin = opts.orgLogin;
            r._scope = "organization";
          }
          aggregateRecords.push(...parsed);
        }
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch aggregate data for org "${opts.orgLogin}": ${err}`);
  }

  return { userRecords, aggregateRecords, apiRequestCount };
}

/**
 * Fetches Copilot usage data across all organizations in an enterprise.
 *
 * 1. Discovers all orgs via enterprise API
 * 2. For each org: fetches user-level data + org aggregate data (PR metrics)
 * 3. Deduplicates user records (first org encountered wins for org attribution)
 */
export async function fetchMultiOrgCopilotUsage(opts: {
  enterpriseSlug: string;
  token: string;
  day?: string;
  /** If provided, only fetch these specific orgs instead of all enterprise orgs. */
  orgLogins?: string[];
  /** Optional log callback for verbose progress messages. */
  onLog?: (msg: string) => void;
}): Promise<MultiOrgResult> {
  let apiRequestCount = 0;
  const log = opts.onLog ?? (() => {});

  // Step 1: Discover orgs (or use provided list)
  let orgs: EnterpriseOrg[];
  if (opts.orgLogins?.length) {
    // Use the provided org list — skip enterprise org discovery
    orgs = opts.orgLogins.map((login) => ({ login, id: 0 }));
    log(`Using ${orgs.length} specified organization(s): ${opts.orgLogins.join(", ")}`);
    console.info(`Using ${orgs.length} specified organization(s): ${opts.orgLogins.join(", ")}`);
  } else {
    log(`Discovering organizations accessible to the token…`);
    const { orgs: discoveredOrgs, apiRequestCount: orgApiCount } = await listEnterpriseOrgs({
      enterpriseSlug: opts.enterpriseSlug,
      token: opts.token,
    });
    apiRequestCount += orgApiCount;
    orgs = discoveredOrgs;
    log(`Organization discovery complete: ${orgs.length} org(s) found in ${orgApiCount} API request(s)`);
    if (orgs.length > 0) {
      log(`Discovered orgs: ${orgs.map(o => `${o.login} (ID: ${o.id})`).join(", ")}`);
    }
  }

  if (orgs.length === 0) {
    console.warn("No organizations found. Falling back to enterprise-level fetch.");
    const result = await fetchCopilotUsage(opts);
    return {
      records: result.records,
      aggregateRecords: [],
      orgs: [],
      apiRequestCount: apiRequestCount + result.apiRequestCount,
    };
  }

  // Step 2: Fetch per-org data
  const allUserRecords: CopilotUsageRecord[] = [];
  const allAggregateRecords: CopilotAggregateRecord[] = [];
  const seenUserDays = new Set<string>(); // "userId|day" → deduplicate

  for (const org of orgs) {
    log(`Fetching data for org "${org.login}" (${orgs.indexOf(org) + 1}/${orgs.length})…`);
    console.info(`Fetching data for org "${org.login}"…`);
    const { userRecords, aggregateRecords, apiRequestCount: orgFetchCount } = await fetchOrgData({
      orgLogin: org.login,
      token: opts.token,
      day: opts.day,
    });
    apiRequestCount += orgFetchCount;

    // Deduplicate user records: first org wins
    for (const record of userRecords) {
      const key = `${record.user_id}|${record.day}`;
      if (!seenUserDays.has(key)) {
        seenUserDays.add(key);
        allUserRecords.push(record);
      }
    }

    allAggregateRecords.push(...aggregateRecords);

    log(`Org "${org.login}": ${userRecords.length} user records, ${aggregateRecords.length} aggregate records (${orgFetchCount} API requests)`);
    console.info(
      `Org "${org.login}": ${userRecords.length} user records, ` +
      `${aggregateRecords.length} aggregate records`
    );
  }

  console.info(
    `Multi-org fetch complete: ${allUserRecords.length} unique user records, ` +
    `${allAggregateRecords.length} aggregate records from ${orgs.length} org(s), ` +
    `${apiRequestCount} API requests`
  );

  return {
    records: allUserRecords,
    aggregateRecords: allAggregateRecords,
    orgs,
    apiRequestCount,
  };
}
