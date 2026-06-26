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
  AggregateReportLine,
  UserTeamRecord,
  EnterpriseOrg,
  EnterpriseTeam,
  EnterpriseTeamMember,
} from "@/types/copilot-api";

const GITHUB_API_BASE = "https://api.github.com";
const API_VERSION = "2026-03-10";
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1000;

/**
 * Thrown for HTTP 4xx responses that should NOT be retried
 * (401, 403, 404, 422, etc.) — retrying will never succeed.
 */
class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

/** Known Node.js network error codes that indicate a transient connection issue. */
const NETWORK_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ENETUNREACH",
  "EPIPE",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

/**
 * Detect transient network errors using the structured `cause.code` property
 * set by Node.js / undici rather than brittle string matching on messages.
 */
function isTransientNetworkError(err: Error): boolean {
  // Node.js wraps low-level errors in a TypeError with a `cause` property
  const cause = (err as NodeJS.ErrnoException).cause as NodeJS.ErrnoException | undefined;
  if (cause?.code && NETWORK_ERROR_CODES.has(cause.code)) return true;

  // Direct errno-style errors (e.g. from net module)
  const directCode = (err as NodeJS.ErrnoException).code;
  if (directCode && NETWORK_ERROR_CODES.has(directCode)) return true;

  // fetch() failures surface as TypeError in Node.js
  if (err.name === "TypeError" && /fetch|network|socket/i.test(err.message)) return true;

  return false;
}

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

function buildEnterpriseAggregateReportUrl(opts: FetchOptions): string {
  const slug = encodeURIComponent(opts.enterpriseSlug);

  if (opts.day) {
    const url = new URL(
      `${GITHUB_API_BASE}/enterprises/${slug}/copilot/metrics/reports/enterprise-1-day`
    );
    url.searchParams.set("day", opts.day);
    return url.toString();
  }

  return `${GITHUB_API_BASE}/enterprises/${slug}/copilot/metrics/reports/enterprise-28-day/latest`;
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
        const body = await response.text().catch(() => "");
        if (response.status === 403) {
          throw new NonRetryableError(
            `GitHub API returned 403 Forbidden for ${url}. Your Personal Access Token (PAT) may not have the required scopes. ` +
            `Please ensure it has: manage_billing:copilot (read), manage_billing:enterprise (read), or read:enterprise. ` +
            `You can update token scopes at https://github.com/settings/tokens. Details: ${body}`
          );
        }
        if (response.status === 404) {
          throw new NonRetryableError(
            `GitHub API returned 404 Not Found for ${url}. This may indicate the enterprise slug or team slug is incorrect ` +
            `or your PAT does not have access to this resource. Details: ${body}`
          );
        }
        if (response.status >= 400 && response.status < 500) {
          throw new NonRetryableError(
            `GitHub API error ${response.status} ${response.statusText} for ${url}: ${body}`
          );
        }
        throw new Error(
          `GitHub API error: ${response.status} ${response.statusText} for ${url}: ${body}`
        );
      }

      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Do not retry on 4xx client errors — they will never succeed on retry.
      if (lastError instanceof NonRetryableError) {
        throw lastError;
      }
      const isNetworkError = isTransientNetworkError(lastError);
      if (attempt < retries - 1) {
        // Use longer backoff for network errors
        const baseMs = isNetworkError ? INITIAL_BACKOFF_MS * 2 : INITIAL_BACKOFF_MS;
        const waitMs = baseMs * Math.pow(2, attempt);
        console.warn(
          `Request failed (${isNetworkError ? "network error" : "error"}): ${lastError.message}. ` +
          `Retrying in ${waitMs}ms (${attempt + 1}/${retries})`
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
 * Flatten an entity-level aggregate report line into per-day aggregate records.
 *
 * The enterprise/organization aggregate reports return one NDJSON line per
 * entity, each wrapping an array of per-day totals under `day_totals`
 * (see the official enterprise-level schema example). This expands those into
 * one `CopilotAggregateRecord` per day. Lines that are already flat (carry a
 * top-level `day`) are passed through unchanged for forward compatibility.
 */
export function flattenAggregateReport(
  lines: AggregateReportLine[],
  scope: "enterprise" | "organization",
  orgLogin?: string
): CopilotAggregateRecord[] {
  const records: CopilotAggregateRecord[] = [];

  for (const line of lines) {
    const dayTotals = line.day_totals;
    if (Array.isArray(dayTotals) && dayTotals.length > 0) {
      for (const dayTotal of dayTotals) {
        records.push({
          ...dayTotal,
          enterprise_id: dayTotal.enterprise_id ?? line.enterprise_id,
          organization_id: dayTotal.organization_id ?? line.organization_id,
          _scope: scope,
          ...(orgLogin ? { _orgLogin: orgLogin } : {}),
        });
      }
    } else if (line.day) {
      // Already flat — keep as-is.
      records.push({
        ...(line as CopilotAggregateRecord),
        _scope: scope,
        ...(orgLogin ? { _orgLogin: orgLogin } : {}),
      });
    }
  }

  return records;
}

/**
 * Fetches enterprise-level aggregate Copilot metrics (active-user counts and
 * pull request metrics) directly from the enterprise aggregate report endpoint
 * (`enterprise-28-day/latest` or `enterprise-1-day?day=`).
 *
 * This avoids looping every organization just to reconstruct enterprise-wide
 * aggregates: GitHub publishes them pre-aggregated at the enterprise scope.
 */
export async function fetchEnterpriseAggregate(
  opts: FetchOptions
): Promise<AggregateResult> {
  let apiRequestCount = 0;

  console.info(
    `Fetching enterprise aggregate metrics for "${opts.enterpriseSlug}" ` +
    `(day: ${opts.day ?? "latest 28-day"})`
  );

  const reportUrl = buildEnterpriseAggregateReportUrl(opts);
  const reportResponse = await fetchWithRetry(reportUrl, opts.token);
  apiRequestCount++;

  const reportData: CopilotMetricsReportResponse = await reportResponse.json();

  if (!reportData.download_links || reportData.download_links.length === 0) {
    console.info("No download links returned from the enterprise aggregate endpoint.");
    return { records: [], apiRequestCount };
  }

  const lines: AggregateReportLine[] = [];
  for (const link of reportData.download_links) {
    const fileResponse = await fetch(link);
    apiRequestCount++;
    if (!fileResponse.ok) {
      console.warn(`Failed to download enterprise aggregate file: ${fileResponse.status} ${fileResponse.statusText}`);
      continue;
    }
    const content = await fileResponse.text();
    lines.push(...parseNdjson<AggregateReportLine>(content));
  }

  const records = flattenAggregateReport(lines, "enterprise");
  console.info(
    `Enterprise aggregate: ${records.length} day record(s) in ${apiRequestCount} API requests`
  );

  return { records, apiRequestCount };
}

/** Returns true for NonRetryableError caused by HTTP 403/404. */
function isForbiddenOrNotFound(err: unknown): boolean {
  return (
    err instanceof NonRetryableError &&
    (/\b403\b/.test(err.message) || /\b404\b/.test(err.message))
  );
}

/**
 * Paginate `GET /user/orgs` — lists all orgs the authenticated token is a member
 * of. Used only as a fallback when the enterprise-scoped endpoint is unavailable
 * (e.g. the token is not an enterprise admin/billing manager).
 */
async function listOrgsViaUserMemberships(
  token: string
): Promise<{ orgs: EnterpriseOrg[]; apiRequestCount: number }> {
  let apiRequestCount = 0;
  const allOrgs: EnterpriseOrg[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `${GITHUB_API_BASE}/user/orgs?per_page=${perPage}&page=${page}`;
    const response = await fetchWithRetry(url, token, MAX_RETRIES);
    apiRequestCount++;

    const orgs: EnterpriseOrg[] = await response.json();
    allOrgs.push(...orgs);

    if (orgs.length < perPage) break;
    page++;
  }

  return { orgs: allOrgs, apiRequestCount };
}

/**
 * Lists all organizations in an enterprise (paginated).
 *
 * Uses the official enterprise-scoped endpoint
 * `GET /enterprises/{enterprise}/organizations`, which returns the true set of
 * organizations owned by the enterprise. If that endpoint is forbidden or not
 * found (e.g. a non-enterprise token, or insufficient scopes), it falls back to
 * `GET /user/orgs`, which only lists orgs the token's user is a member of and
 * can therefore under-count enterprise organizations.
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

  const slug = encodeURIComponent(opts.enterpriseSlug);

  try {
    while (true) {
      const url = `${GITHUB_API_BASE}/enterprises/${slug}/organizations?per_page=${perPage}&page=${page}`;
      const response = await fetchWithRetry(url, opts.token, MAX_RETRIES);
      apiRequestCount++;

      const orgs: EnterpriseOrg[] = await response.json();
      allOrgs.push(...orgs);

      if (orgs.length < perPage) break;
      page++;
    }

    console.info(`Found ${allOrgs.length} organization(s) in enterprise "${opts.enterpriseSlug}"`);
    return { orgs: allOrgs, apiRequestCount };
  } catch (err) {
    if (!isForbiddenOrNotFound(err)) throw err;

    console.warn(
      `Enterprise organizations endpoint unavailable (${(err as Error).message}). ` +
      `Falling back to GET /user/orgs (may under-count enterprise organizations).`
    );

    const fallback = await listOrgsViaUserMemberships(opts.token);
    apiRequestCount += fallback.apiRequestCount;

    console.info(`Found ${fallback.orgs.length} organization(s) accessible to the token (fallback)`);
    return { orgs: fallback.orgs, apiRequestCount };
  }
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

export interface CopilotSeatAssignee {
  login: string;
  avatar_url?: string;
  id?: number;
}

export interface CopilotSeatAssigningTeam {
  id: number;
  name: string;
  slug: string;
}

export interface CopilotSeatOrganization {
  login: string;
  id?: number;
}

export interface CopilotSeat {
  created_at: string;
  updated_at: string;
  pending_cancellation_date: string | null;
  last_activity_at: string | null;
  last_activity_editor: string | null;
  plan_type: string;
  assignee: CopilotSeatAssignee;
  assigning_team: CopilotSeatAssigningTeam | null;
  organization?: CopilotSeatOrganization;
}

interface CopilotSeatsResponse {
  total_seats: number;
  seats: CopilotSeat[];
}

/**
 * Lists all Copilot seat assignments for an enterprise (paginated).
 * Requires billing read permissions (`manage_billing:copilot` or equivalent).
 */
export async function listEnterpriseCopilotSeats(opts: {
  enterpriseSlug: string;
  token: string;
}): Promise<{ seats: CopilotSeat[]; totalSeats: number; apiRequestCount: number }> {
  const seats: CopilotSeat[] = [];
  let apiRequestCount = 0;
  let totalSeats = 0;
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `${GITHUB_API_BASE}/enterprises/${encodeURIComponent(opts.enterpriseSlug)}/copilot/billing/seats?per_page=${perPage}&page=${page}`;
    const response = await fetchWithRetry(url, opts.token, MAX_RETRIES);
    apiRequestCount++;
    const data = (await response.json()) as CopilotSeatsResponse;
    totalSeats = data.total_seats;
    seats.push(...data.seats);

    if (seats.length >= totalSeats || data.seats.length < perPage) break;
    page++;
  }

  return { seats, totalSeats, apiRequestCount };
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
      const lines: AggregateReportLine[] = [];
      for (const link of aggReportData.download_links) {
        const fileResponse = await fetch(link);
        apiRequestCount++;
        if (!fileResponse.ok) {
          console.warn(
            `Failed to download org aggregate file for "${opts.orgLogin}": ${fileResponse.status} ${fileResponse.statusText}`
          );
          continue;
        }
        const content = await fileResponse.text();
        lines.push(...parseNdjson<AggregateReportLine>(content));
      }
      aggregateRecords.push(
        ...flattenAggregateReport(lines, "organization", opts.orgLogin)
      );
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

/**
 * Lists all enterprise teams (paginated).
 * Requires `read:enterprise` scope.
 * Docs: https://docs.github.com/en/enterprise-cloud@latest/rest/enterprise-teams
 */
export async function listEnterpriseTeams(opts: {
  enterpriseSlug: string;
  token: string;
  onLog?: (msg: string) => void;
}): Promise<{ teams: EnterpriseTeam[]; apiRequestCount: number }> {
  let apiRequestCount = 0;
  const allTeams: EnterpriseTeam[] = [];
  let page = 1;
  const perPage = 100;
  const log = opts.onLog ?? (() => {});

  log(`Fetching enterprise teams for "${opts.enterpriseSlug}"…`);
  console.info(`Fetching enterprise teams for "${opts.enterpriseSlug}"…`);

  while (true) {
    const url = `${GITHUB_API_BASE}/enterprises/${encodeURIComponent(opts.enterpriseSlug)}/teams?per_page=${perPage}&page=${page}`;
    const response = await fetchWithRetry(url, opts.token, MAX_RETRIES);
    apiRequestCount++;

    const teams: EnterpriseTeam[] = await response.json();
    allTeams.push(...teams);

    log(`Fetched page ${page}: ${teams.length} team(s) (total: ${allTeams.length})`);

    if (teams.length < perPage) break;
    page++;
  }

  console.info(`Found ${allTeams.length} enterprise team(s) in ${apiRequestCount} API request(s)`);
  log(`Enterprise team discovery complete: ${allTeams.length} team(s) found`);
  return { teams: allTeams, apiRequestCount };
}

/**
 * Lists all members of an enterprise team (paginated).
 * Docs: https://docs.github.com/en/enterprise-cloud@latest/rest/enterprise-teams/enterprise-team-members?apiVersion=2026-03-10
 * Endpoint: GET /enterprises/{enterprise}/teams/{enterprise-team}/memberships
 *
 * The {enterprise-team} path parameter accepts either the team slug (which
 * carries an `ent:` prefix, e.g. `ent:my-team`) OR the numeric team ID.
 * We prefer the team ID when available since it avoids URL-encoding
 * ambiguity around the `:` character and is cheaper to match server-side.
 */
export async function listEnterpriseTeamMembers(opts: {
  enterpriseSlug: string;
  teamSlug: string;
  teamId?: number;
  token: string;
  onLog?: (msg: string) => void;
}): Promise<{ members: EnterpriseTeamMember[]; apiRequestCount: number }> {
  let apiRequestCount = 0;
  const allMembers: EnterpriseTeamMember[] = [];
  let page = 1;
  const perPage = 100;
  const log = opts.onLog ?? (() => {});

  // Prefer team ID; fall back to slug.
  const teamRef =
    typeof opts.teamId === "number"
      ? String(opts.teamId)
      : encodeURIComponent(opts.teamSlug);

  log(`Fetching members for enterprise team "${opts.teamSlug}" (ref=${teamRef})…`);

  while (true) {
    const url = `${GITHUB_API_BASE}/enterprises/${encodeURIComponent(opts.enterpriseSlug)}/teams/${teamRef}/memberships?per_page=${perPage}&page=${page}`;
    const response = await fetchWithRetry(url, opts.token, MAX_RETRIES);
    apiRequestCount++;

    const members: EnterpriseTeamMember[] = await response.json();
    allMembers.push(...members);

    if (members.length < perPage) break;
    page++;
  }

  log(`Team "${opts.teamSlug}": ${allMembers.length} member(s)`);
  return { members: allMembers, apiRequestCount };
}

/**
 * Fetches the daily `user-teams` report and returns one row per
 * `(user, team)` membership for the given day.
 *
 * This is the officially supported source for team attribution: the per-user
 * usage report does not carry team membership. Callers join these rows to the
 * daily per-user usage report on `(user_id, day)` and aggregate by `team_id`.
 *
 * Endpoints:
 *   GET /enterprises/{enterprise}/copilot/metrics/reports/user-teams-1-day?day=
 *   GET /orgs/{org}/copilot/metrics/reports/user-teams-1-day?day=
 *
 * Caveats (per GitHub docs):
 *   - Reports are daily only; always join daily activity with daily membership.
 *   - Teams with fewer than 5 seated Copilot users are omitted.
 */
export async function fetchUserTeams(opts: {
  /** YYYY-MM-DD. Required — the report only exists per day. */
  day: string;
  token: string;
  /** Provide for the enterprise-scoped report. */
  enterpriseSlug?: string;
  /** Provide for the organization-scoped report. */
  orgLogin?: string;
}): Promise<{ records: UserTeamRecord[]; apiRequestCount: number }> {
  let apiRequestCount = 0;

  let base: string;
  if (opts.orgLogin) {
    base = `${GITHUB_API_BASE}/orgs/${encodeURIComponent(opts.orgLogin)}/copilot/metrics/reports/user-teams-1-day`;
  } else if (opts.enterpriseSlug) {
    base = `${GITHUB_API_BASE}/enterprises/${encodeURIComponent(opts.enterpriseSlug)}/copilot/metrics/reports/user-teams-1-day`;
  } else {
    throw new Error("fetchUserTeams requires either enterpriseSlug or orgLogin");
  }

  const url = new URL(base);
  url.searchParams.set("day", opts.day);

  const reportResponse = await fetchWithRetry(url.toString(), opts.token);
  apiRequestCount++;

  const reportData: CopilotMetricsReportResponse = await reportResponse.json();
  if (!reportData.download_links?.length) {
    return { records: [], apiRequestCount };
  }

  const records: UserTeamRecord[] = [];
  for (const link of reportData.download_links) {
    const fileResponse = await fetch(link);
    apiRequestCount++;
    if (!fileResponse.ok) {
      console.warn(`Failed to download user-teams file: ${fileResponse.status} ${fileResponse.statusText}`);
      continue;
    }
    const content = await fileResponse.text();
    records.push(...parseNdjson<UserTeamRecord>(content));
  }

  return { records, apiRequestCount };
}

/**
 * Build a `(user_id|day) → team_id` lookup from user-teams rows.
 *
 * A user may belong to multiple teams on the same day. The fact tables carry a
 * single team per user/day, so the lowest `team_id` is chosen deterministically
 * as the representative team. Use this map to annotate per-user usage records
 * with `_teamGithubId` before loading.
 */
export function buildUserTeamMap(records: UserTeamRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of records) {
    if (r.team_id == null) continue;
    const key = `${r.user_id}|${r.day}`;
    const existing = map.get(key);
    if (existing === undefined || r.team_id < existing) {
      map.set(key, r.team_id);
    }
  }
  return map;
}
