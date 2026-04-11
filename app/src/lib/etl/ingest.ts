/**
 * ETL ingestion pipeline for Copilot Usage Metrics.
 *
 * Supports two modes:
 * 1. Pull from GitHub API using PAT + enterprise slug
 * 2. Load from uploaded NDJSON file (official metrics export)
 */

import { db } from "@/lib/db";
import {
  rawCopilotUsage,
  factCopilotUsageDaily,
  factUserFeatureDaily,
  factUserIdeDaily,
  factUserLanguageDaily,
  factUserModelDaily,
  factCliDaily,
  factUserLanguageModelDaily,
  factOrgAggregateDaily,
  dimIde,
  dimFeature,
  dimLanguage,
  dimModel,
  dimUser,
  dimOrg,
  ingestionLog,
} from "@/lib/db/schema";
import { fetchCopilotUsage, fetchMultiOrgCopilotUsage } from "@/lib/github/copilot-api";
import type { CopilotUsageRecord, CopilotAggregateRecord, EnterpriseOrg } from "@/types/copilot-api";
import type { SyncScope } from "@/lib/db/settings";
import {
  transformToFactUsage,
  transformToFactFeatures,
  transformToFactIdes,
  transformToFactLanguages,
  transformToFactModels,
  transformToFactCli,
  transformToFactLanguageModels,
  transformToFactOrgAggregate,
  extractUniqueIdes,
  extractUniqueFeatures,
  extractUniqueLanguages,
  extractUniqueModels,
  extractUniqueOrgIds,
  computeRecordHash,
} from "./transform";
import { eq, sql, and, inArray } from "drizzle-orm";


interface IngestOptions {
  enterpriseSlug: string;
  token: string;
  /** Specific day in YYYY-MM-DD format. If omitted, fetches the latest 28-day report. */
  day?: string;
  onLog?: (message: string) => void;
  /** Source of the ingestion: "api" (manual), "scheduled", "file_upload" */
  source?: string;
  /** Sync scopes to run. Multiple scopes are combined (e.g., enterprise + org). */
  scopes?: SyncScope[];
  /** When scopes includes "organization", the specific org logins to sync. */
  orgLogins?: string[];
}

interface FileIngestOptions {
  records: CopilotUsageRecord[];
  onLog?: (message: string) => void;
}

/**
 * Upsert dimension values and return a lookup map of name → id.
 */
async function ensureDimensions(
  records: CopilotUsageRecord[],
  discoveredOrgs?: EnterpriseOrg[]
) {
  // Organizations — from discovered orgs + any org IDs in records
  if (discoveredOrgs?.length) {
    for (const org of discoveredOrgs) {
      await db
        .insert(dimOrg)
        .values({
          orgName: org.login,
          githubOrgId: org.id,
        })
        .onConflictDoUpdate({
          target: dimOrg.orgName,
          set: { githubOrgId: org.id, updatedAt: new Date() },
        });
    }
  }

  // Also handle org IDs from records (e.g. from file uploads)
  const orgGithubIds = extractUniqueOrgIds(records);
  for (const ghOrgId of orgGithubIds) {
    await db
      .insert(dimOrg)
      .values({ orgName: String(ghOrgId) })
      .onConflictDoNothing({ target: dimOrg.orgName });
  }

  // Handle _orgLogin from per-org fetches
  const orgLogins = new Set<string>();
  for (const r of records) {
    if (r._orgLogin) orgLogins.add(r._orgLogin);
  }
  for (const login of orgLogins) {
    await db
      .insert(dimOrg)
      .values({ orgName: login })
      .onConflictDoNothing({ target: dimOrg.orgName });
  }

  const orgs = await db.select().from(dimOrg);
  const orgMap = new Map(orgs.map((o) => [o.orgName, o.orgId]));
  // Also map githubOrgId → orgId
  const orgIdToKeyMap = new Map(orgs.filter(o => o.githubOrgId).map((o) => [String(o.githubOrgId), o.orgId]));

  // IDEs
  const ideNames = extractUniqueIdes(records);
  for (const name of ideNames) {
    await db
      .insert(dimIde)
      .values({ ideName: name })
      .onConflictDoNothing({ target: dimIde.ideName });
  }
  const ides = await db.select().from(dimIde);
  const ideMap = new Map(ides.map((i) => [i.ideName, i.ideId]));

  // Features
  const featureNames = extractUniqueFeatures(records);
  for (const name of featureNames) {
    await db
      .insert(dimFeature)
      .values({ featureName: name })
      .onConflictDoNothing({ target: dimFeature.featureName });
  }
  const features = await db.select().from(dimFeature);
  const featureMap = new Map(features.map((f) => [f.featureName, f.featureId]));

  // Languages
  const langNames = extractUniqueLanguages(records);
  for (const name of langNames) {
    await db
      .insert(dimLanguage)
      .values({ languageName: name })
      .onConflictDoNothing({ target: dimLanguage.languageName });
  }
  const langs = await db.select().from(dimLanguage);
  const langMap = new Map(langs.map((l) => [l.languageName, l.languageId]));

  // Models
  const modelNames = extractUniqueModels(records);
  for (const name of modelNames) {
    await db
      .insert(dimModel)
      .values({ modelName: name })
      .onConflictDoNothing();
  }
  const models = await db.select().from(dimModel);
  const modelMap = new Map(models.map((m) => [m.modelName, m.modelId]));

  return { ideMap, featureMap, langMap, modelMap, orgMap, orgIdToKeyMap };
}

/**
 * Ensure user dimension entries exist.
 */
async function ensureUsers(
  records: CopilotUsageRecord[],
  orgMap: Map<string, number>,
  orgIdToKeyMap: Map<string, number>
) {
  const seen = new Set<number>();
  for (const r of records) {
    if (seen.has(r.user_id)) continue;
    seen.add(r.user_id);

    // Resolve org: prefer _orgLogin (per-org fetch), then organization_id (from record)
    let resolvedOrgId: number | null = null;
    if (r._orgLogin) {
      resolvedOrgId = orgMap.get(r._orgLogin) ?? null;
    }
    if (!resolvedOrgId && r.organization_id) {
      resolvedOrgId = orgMap.get(String(r.organization_id))
        ?? orgIdToKeyMap.get(String(r.organization_id))
        ?? null;
    }

    // Check if user already exists as current
    const existing = await db
      .select()
      .from(dimUser)
      .where(eq(dimUser.userId, r.user_id))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(dimUser).values({
        userId: r.user_id,
        userLogin: r.user_login,
        orgId: resolvedOrgId,
        isCurrent: true,
      });
    } else if (resolvedOrgId && !existing[0].orgId) {
      // Backfill orgId for existing users that don't have one
      await db
        .update(dimUser)
        .set({ orgId: resolvedOrgId })
        .where(eq(dimUser.userId, r.user_id));
    }
  }
}

/**
 * Core loading logic shared by both API and file-upload ingest modes.
 * Stores raw JSON, upserts dimensions/users, and loads all fact tables.
 * Uses content hashing to detect and skip duplicate records.
 */
async function loadRecords(
  records: CopilotUsageRecord[],
  logEntryId: number,
  log: (msg: string) => void,
  discoveredOrgs?: EnterpriseOrg[],
  aggregateRecords?: CopilotAggregateRecord[]
): Promise<{ inserted: number; skipped: number; aggregateInserted: number }> {
  // Compute content hashes for all incoming records
  log("Computing content hashes for deduplication…");
  const recordsWithHash = records.map((record) => ({
    record,
    hash: computeRecordHash(record),
    key: `${record.day}|${record.enterprise_id}|${record.user_id}`,
  }));

  // Batch-fetch existing hashes from raw_copilot_usage for the incoming keys
  const reportDates = [...new Set(records.map((r) => r.day))];
  const existingRows = reportDates.length > 0
    ? await db
        .select({
          reportDate: rawCopilotUsage.reportDate,
          enterpriseId: rawCopilotUsage.enterpriseId,
          userId: rawCopilotUsage.userId,
          contentHash: rawCopilotUsage.contentHash,
        })
        .from(rawCopilotUsage)
        .where(inArray(rawCopilotUsage.reportDate, reportDates))
    : [];

  const existingHashMap = new Map(
    existingRows.map((r) => [`${r.reportDate}|${r.enterpriseId}|${r.userId}`, r.contentHash])
  );

  // Partition records into new, updated (hash changed), and duplicate (hash identical)
  const newRecords: typeof recordsWithHash = [];
  const updatedRecords: typeof recordsWithHash = [];
  let skipped = 0;

  for (const entry of recordsWithHash) {
    const existingHash = existingHashMap.get(entry.key);
    if (existingHash === undefined) {
      newRecords.push(entry);
    } else if (existingHash === entry.hash) {
      skipped++;
    } else {
      updatedRecords.push(entry);
    }
  }

  const toProcess = [...newRecords, ...updatedRecords];
  log(`Dedup: ${newRecords.length} new, ${updatedRecords.length} updated, ${skipped} duplicate (skipped)`);

  // Always ensure dimensions exist using ALL input records (not just dedup-filtered).
  // This is critical: if data was first ingested before org/dimension support was added,
  // a re-import with all duplicates would otherwise skip dimension extraction entirely.
  log("Upserting dimension tables (IDEs, features, languages, models, orgs)…");
  const { ideMap, featureMap, langMap, modelMap, orgMap, orgIdToKeyMap } =
    await ensureDimensions(records, discoveredOrgs);
  log(`Dimensions loaded — IDEs: ${ideMap.size}, features: ${featureMap.size}, languages: ${langMap.size}, models: ${modelMap.size}, orgs: ${orgMap.size}`);

  // Always ensure users exist from ALL input records
  const uniqueUserCount = new Set(records.map((r) => r.user_id)).size;
  log(`Upserting ${uniqueUserCount} users…`);
  await ensureUsers(records, orgMap, orgIdToKeyMap);
  log("User dimension updated");

  if (toProcess.length === 0) {
    log("All records are duplicates — nothing to process");
    return { inserted: 0, skipped, aggregateInserted: 0 };
  }

  // Store raw JSON with content hash
  log("Storing raw JSON records…");
  for (const { record, hash } of toProcess) {
    await db
      .insert(rawCopilotUsage)
      .values({
        reportDate: record.day,
        enterpriseId: parseInt(String(record.enterprise_id), 10) || 0,
        userId: record.user_id,
        rawJson: record,
        contentHash: hash,
      })
      .onConflictDoUpdate({
        target: [rawCopilotUsage.reportDate, rawCopilotUsage.enterpriseId, rawCopilotUsage.userId],
        set: {
          rawJson: sql`EXCLUDED.raw_json`,
          contentHash: sql`EXCLUDED.content_hash`,
          ingestedAt: sql`now()`,
        },
      });
  }
  log(`Raw JSON stored for ${toProcess.length} records`);

  // Load fact tables
  log("Loading fact tables…");
  let inserted = 0;

  for (const { record } of toProcess) {
    const factRow = transformToFactUsage(record);
    // Resolve org: prefer _orgLogin (per-org fetch), then organizationId from record
    let resolvedOrgId: number | null = null;
    if (record._orgLogin) {
      resolvedOrgId = orgMap.get(record._orgLogin) ?? null;
    }
    if (!resolvedOrgId && factRow.organizationId) {
      resolvedOrgId = orgMap.get(String(factRow.organizationId))
        ?? orgIdToKeyMap.get(String(factRow.organizationId))
        ?? null;
    }

    log(`Processing record: user=${record.user_login}, date=${record.day}`);

    // Core usage fact
    await db
      .insert(factCopilotUsageDaily)
      .values({
        day: factRow.day,
        enterpriseId: factRow.enterpriseId,
        userId: factRow.userId,
        userLogin: factRow.userLogin,
        orgId: resolvedOrgId,
        userInitiatedInteractionCount: factRow.userInitiatedInteractionCount,
        codeGenerationActivityCount: factRow.codeGenerationActivityCount,
        codeAcceptanceActivityCount: factRow.codeAcceptanceActivityCount,
        usedAgent: factRow.usedAgent,
        usedCopilotCodingAgent: factRow.usedCopilotCodingAgent,
        usedChat: factRow.usedChat,
        usedCli: factRow.usedCli,
        locSuggestedToAddSum: factRow.locSuggestedToAddSum,
        locSuggestedToDeleteSum: factRow.locSuggestedToDeleteSum,
        locAddedSum: factRow.locAddedSum,
        locDeletedSum: factRow.locDeletedSum,
      })
      .onConflictDoNothing();

    // Feature facts
    const featureRows = transformToFactFeatures(record);
    for (const fr of featureRows) {
      const fId = featureMap.get(fr.featureName);
      if (!fId) continue;
      await db
        .insert(factUserFeatureDaily)
        .values({
          day: fr.day,
          userId: fr.userId,
          featureId: fId,
          userInitiatedInteractionCount: fr.userInitiatedInteractionCount,
          codeGenerationActivityCount: fr.codeGenerationActivityCount,
          codeAcceptanceActivityCount: fr.codeAcceptanceActivityCount,
        })
        .onConflictDoNothing();
    }

    // IDE facts
    const ideRows = transformToFactIdes(record);
    for (const ir of ideRows) {
      const iId = ideMap.get(ir.ideName);
      if (!iId) continue;
      await db
        .insert(factUserIdeDaily)
        .values({
          day: ir.day,
          userId: ir.userId,
          ideId: iId,
          userInitiatedInteractionCount: ir.userInitiatedInteractionCount,
          codeGenerationActivityCount: ir.codeGenerationActivityCount,
          codeAcceptanceActivityCount: ir.codeAcceptanceActivityCount,
        })
        .onConflictDoNothing();
    }

    // Language facts
    const langRows = transformToFactLanguages(record);
    for (const lr of langRows) {
      const lId = langMap.get(lr.languageName);
      const fId = featureMap.get(lr.featureName);
      if (!lId || !fId) continue;
      await db
        .insert(factUserLanguageDaily)
        .values({
          day: lr.day,
          userId: lr.userId,
          languageId: lId,
          featureId: fId,
          userInitiatedInteractionCount: lr.userInitiatedInteractionCount,
          codeGenerationActivityCount: lr.codeGenerationActivityCount,
          codeAcceptanceActivityCount: lr.codeAcceptanceActivityCount,
        })
        .onConflictDoNothing();
    }

    // Model facts
    const modelRows = transformToFactModels(record);
    for (const mr of modelRows) {
      const mId = modelMap.get(mr.modelName);
      const fId = featureMap.get(mr.featureName);
      if (!mId || !fId) continue;
      await db
        .insert(factUserModelDaily)
        .values({
          day: mr.day,
          userId: mr.userId,
          modelId: mId,
          featureId: fId,
          userInitiatedInteractionCount: mr.userInitiatedInteractionCount,
          codeGenerationActivityCount: mr.codeGenerationActivityCount,
          codeAcceptanceActivityCount: mr.codeAcceptanceActivityCount,
        })
        .onConflictDoNothing();
    }

    // CLI facts
    const cliRows = transformToFactCli(record);
    for (const cr of cliRows) {
      await db
        .insert(factCliDaily)
        .values({
          day: cr.day,
          userId: cr.userId,
          cliVersion: cr.cliVersion,
          sessionCount: cr.sessionCount,
          requestCount: cr.requestCount,
          promptCount: cr.promptCount,
          promptTokens: cr.promptTokens,
          completionTokens: cr.completionTokens,
          totalTokens: cr.totalTokens,
        })
        .onConflictDoNothing();
    }

    // Language-Model facts
    const langModelRows = transformToFactLanguageModels(record);
    for (const lmr of langModelRows) {
      const lId = langMap.get(lmr.languageName);
      const mId = modelMap.get(lmr.modelName);
      if (!lId || !mId) continue;
      await db
        .insert(factUserLanguageModelDaily)
        .values({
          day: lmr.day,
          userId: lmr.userId,
          languageId: lId,
          modelId: mId,
          codeGenerationActivityCount: lmr.codeGenerationActivityCount,
          codeAcceptanceActivityCount: lmr.codeAcceptanceActivityCount,
        })
        .onConflictDoNothing();
    }

    inserted++;

    if (inserted % 50 === 0) {
      log(`Progress: ${inserted}/${toProcess.length} records processed`);
    }
  }

  // Load aggregate records (PR metrics, active user counts)
  let aggregateInserted = 0;
  if (aggregateRecords?.length) {
    log(`Loading ${aggregateRecords.length} aggregate records (PR metrics)…`);
    for (const aggRecord of aggregateRecords) {
      const row = transformToFactOrgAggregate(aggRecord);
      const resolvedOrgId = row.orgLogin ? orgMap.get(row.orgLogin) ?? null : null;

      await db
        .insert(factOrgAggregateDaily)
        .values({
          day: row.day,
          orgId: resolvedOrgId,
          scope: row.scope,
          dailyActiveUsers: row.dailyActiveUsers,
          weeklyActiveUsers: row.weeklyActiveUsers,
          monthlyActiveUsers: row.monthlyActiveUsers,
          monthlyActiveAgentUsers: row.monthlyActiveAgentUsers,
          monthlyActiveChatUsers: row.monthlyActiveChatUsers,
          dailyActiveCliUsers: row.dailyActiveCliUsers,
          prTotalCreated: row.prTotalCreated,
          prTotalReviewed: row.prTotalReviewed,
          prTotalMerged: row.prTotalMerged,
          prMedianMinutesToMerge: row.prMedianMinutesToMerge,
          prTotalSuggestions: row.prTotalSuggestions,
          prTotalAppliedSuggestions: row.prTotalAppliedSuggestions,
          prTotalCreatedByCopilot: row.prTotalCreatedByCopilot,
          prTotalReviewedByCopilot: row.prTotalReviewedByCopilot,
          prTotalMergedCreatedByCopilot: row.prTotalMergedCreatedByCopilot,
          prTotalMergedReviewedByCopilot: row.prTotalMergedReviewedByCopilot,
          prMedianMinutesToMergeCopilotAuthored: row.prMedianMinutesToMergeCopilotAuthored,
          prMedianMinutesToMergeCopilotReviewed: row.prMedianMinutesToMergeCopilotReviewed,
          prTotalCopilotSuggestions: row.prTotalCopilotSuggestions,
          prTotalCopilotAppliedSuggestions: row.prTotalCopilotAppliedSuggestions,
        })
        .onConflictDoUpdate({
          target: [factOrgAggregateDaily.day, factOrgAggregateDaily.orgId, factOrgAggregateDaily.scope],
          set: {
            dailyActiveUsers: sql`EXCLUDED.daily_active_users`,
            weeklyActiveUsers: sql`EXCLUDED.weekly_active_users`,
            monthlyActiveUsers: sql`EXCLUDED.monthly_active_users`,
            prTotalCreated: sql`EXCLUDED.pr_total_created`,
            prTotalReviewed: sql`EXCLUDED.pr_total_reviewed`,
            prTotalMerged: sql`EXCLUDED.pr_total_merged`,
            prMedianMinutesToMerge: sql`EXCLUDED.pr_median_minutes_to_merge`,
            prTotalCreatedByCopilot: sql`EXCLUDED.pr_total_created_by_copilot`,
            prTotalReviewedByCopilot: sql`EXCLUDED.pr_total_reviewed_by_copilot`,
            prTotalMergedCreatedByCopilot: sql`EXCLUDED.pr_total_merged_created_by_copilot`,
          },
        });

      aggregateInserted++;
    }
    log(`Aggregate records loaded: ${aggregateInserted}`);
  }

  log(`All fact tables loaded — ${inserted} records processed, ${skipped} duplicates skipped, ${aggregateInserted} aggregates`);
  return { inserted, skipped, aggregateInserted };
}

/**
 * Ingest from GitHub API. Fetches per-org data, transforms, and loads Copilot usage data.
 * Uses multi-org strategy: discovers all orgs, fetches user + aggregate data per org.
 */
export async function ingestCopilotUsage(opts: IngestOptions): Promise<{
  recordsFetched: number;
  recordsInserted: number;
  recordsSkipped: number;
  aggregateRecords: number;
  apiRequests: number;
  orgsDiscovered: number;
}> {
  const messages: string[] = [];
  const log = (msg: string) => {
    messages.push(`[${new Date().toISOString()}] ${msg}`);
    opts.onLog?.(msg);
  };
  const today = new Date().toISOString().split("T")[0];
  const scopes = opts.scopes ?? ["enterprise"];

  const SCOPE_LABELS: Record<SyncScope, string> = {
    enterprise: "Enterprise (enterprise-level metrics endpoint)",
    all_orgs: "All Organizations (discover & fetch per-org)",
    organization: `Specific Organizations (${opts.orgLogins?.join(", ") ?? "none"})`,
  };

  const scopeLabels = scopes.map((s) => SCOPE_LABELS[s]);
  const scopeStored = scopes.join(",");
  const scopeDetailParts: string[] = [];
  if (scopes.includes("enterprise")) scopeDetailParts.push("enterprise-level endpoint");
  if (scopes.includes("all_orgs")) scopeDetailParts.push("all discovered orgs");
  if (scopes.includes("organization")) scopeDetailParts.push(opts.orgLogins?.join(", ") ?? "");
  const scopeDetail = scopeDetailParts.filter(Boolean).join(" + ");

  log(`═══ Ingestion Started ═══`);
  log(`Enterprise: ${opts.enterpriseSlug}`);
  log(`Scopes: ${scopeLabels.join(" + ")}`);
  log(`Day filter: ${opts.day ?? "latest 28-day report"}`);
  log(`Source: ${opts.source ?? "api"}`);

  const [logEntry] = await db
    .insert(ingestionLog)
    .values({
      ingestionDate: today,
      source: opts.source ?? "api",
      scope: scopeStored,
      scopeDetail,
      status: "running",
    })
    .returning();

  log(`Ingestion log entry #${logEntry.id} created`);

  try {
    const fetchStartTime = Date.now();
    log("── Phase 1: Fetching data from GitHub API ──");

    let records: CopilotUsageRecord[] = [];
    let aggregateRecords: CopilotAggregateRecord[] = [];
    let orgs: EnterpriseOrg[] = [];
    let apiRequestCount = 0;

    // Run each scope phase, combining results
    const hasEnterprise = scopes.includes("enterprise");
    const hasAllOrgs = scopes.includes("all_orgs");
    const hasOrganization = scopes.includes("organization");

    if (hasEnterprise) {
      log(`── Scope: Enterprise ──`);
      log(`Calling enterprise-level user metrics endpoint for "${opts.enterpriseSlug}"…`);
      const result = await fetchCopilotUsage({
        enterpriseSlug: opts.enterpriseSlug,
        token: opts.token,
        day: opts.day,
      });
      records.push(...result.records);
      apiRequestCount += result.apiRequestCount;
      log(`Enterprise endpoint returned ${result.records.length} user records in ${result.apiRequestCount} API requests`);
    }

    if (hasAllOrgs || hasOrganization) {
      const orgScopeLabel = hasAllOrgs ? "All Organizations" : "Specific Organizations";
      log(`── Scope: ${orgScopeLabel} ──`);

      const orgResult = await fetchMultiOrgCopilotUsage({
        enterpriseSlug: opts.enterpriseSlug,
        token: opts.token,
        day: opts.day,
        orgLogins: hasOrganization ? opts.orgLogins : undefined,
        onLog: log,
      });

      // Deduplicate against enterprise records if both scopes are active
      if (hasEnterprise && orgResult.records.length > 0) {
        const existingKeys = new Set(records.map((r) => `${r.user_id}|${r.day}`));
        let orgNew = 0;
        let orgDup = 0;
        for (const r of orgResult.records) {
          const key = `${r.user_id}|${r.day}`;
          if (!existingKeys.has(key)) {
            records.push(r);
            existingKeys.add(key);
            orgNew++;
          } else {
            orgDup++;
          }
        }
        log(`Org records: ${orgNew} new, ${orgDup} already covered by enterprise scope`);
      } else {
        records.push(...orgResult.records);
      }

      aggregateRecords.push(...orgResult.aggregateRecords);
      orgs.push(...orgResult.orgs);
      apiRequestCount += orgResult.apiRequestCount;
      log(`Org fetch: ${orgResult.records.length} user records, ${orgResult.aggregateRecords.length} aggregates, ${orgResult.orgs.length} org(s), ${orgResult.apiRequestCount} API requests`);
    }

    const fetchDuration = ((Date.now() - fetchStartTime) / 1000).toFixed(1);
    log(`── Phase 1 complete (${fetchDuration}s) ──`);
    log(`Total API requests: ${apiRequestCount}`);
    log(`Organizations: ${orgs.length > 0 ? orgs.map(o => o.login).join(", ") : "(enterprise-level only)"}`);
    log(`Total user records: ${records.length}`);
    log(`Total aggregate records: ${aggregateRecords.length}`);

    if (records.length > 0) {
      const dates = records.map(r => r.day).filter(Boolean);
      const uniqueDates = [...new Set(dates)].sort();
      if (uniqueDates.length > 0) {
        log(`Date range: ${uniqueDates[0]} → ${uniqueDates[uniqueDates.length - 1]} (${uniqueDates.length} unique days)`);
      }
      const uniqueUsers = new Set(records.map(r => r.user_id));
      log(`Unique users in dataset: ${uniqueUsers.size}`);
    }

    if (records.length === 0) {
      log("No records returned from GitHub API. Nothing to ingest.");
      console.info("No records fetched. Nothing to ingest.");
      await db
        .update(ingestionLog)
        .set({
          status: "success",
          completedAt: new Date(),
          recordsFetched: 0,
          orgsDiscovered: orgs.length,
          logMessages: messages.join("\n"),
        })
        .where(eq(ingestionLog.id, logEntry.id));
      return { recordsFetched: 0, recordsInserted: 0, recordsSkipped: 0, aggregateRecords: 0, apiRequests: apiRequestCount, orgsDiscovered: orgs.length };
    }

    const loadStartTime = Date.now();
    log(`── Phase 2: Loading into database ──`);

    const { inserted, skipped, aggregateInserted } = await loadRecords(
      records,
      logEntry.id,
      log,
      orgs,
      aggregateRecords
    );

    const loadDuration = ((Date.now() - loadStartTime) / 1000).toFixed(1);
    const totalDuration = ((Date.now() - fetchStartTime) / 1000).toFixed(1);

    log(`── Phase 2 complete (${loadDuration}s) ──`);
    log(`═══ Ingestion Summary ═══`);
    log(`Total duration: ${totalDuration}s`);
    log(`Records fetched: ${records.length}`);
    log(`Records inserted: ${inserted}`);
    log(`Duplicates skipped: ${skipped}`);
    log(`Aggregate records: ${aggregateInserted}`);
    log(`Organizations: ${orgs.length}`);
    log(`API requests: ${apiRequestCount}`);
    log(`Status: SUCCESS`);

    await db
      .update(ingestionLog)
      .set({
        status: "success",
        completedAt: new Date(),
        recordsFetched: records.length,
        recordsInserted: inserted,
        recordsSkipped: skipped,
        aggregateRecords: aggregateInserted,
        orgsDiscovered: orgs.length,
        apiRequests: apiRequestCount,
        logMessages: messages.join("\n"),
      })
      .where(eq(ingestionLog.id, logEntry.id));

    console.info(`Ingestion complete: ${inserted} records processed, ${skipped} duplicates skipped, ${aggregateInserted} aggregates, ${orgs.length} orgs.`);

    return {
      recordsFetched: records.length,
      recordsInserted: inserted,
      recordsSkipped: skipped,
      aggregateRecords: aggregateInserted,
      apiRequests: apiRequestCount,
      orgsDiscovered: orgs.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Ingestion failed: ${message}`);
    log(`═══ ERROR ═══`);
    log(`${message}`);

    await db
      .update(ingestionLog)
      .set({
        status: "error",
        completedAt: new Date(),
        errorMessage: message,
        logMessages: messages.join("\n"),
      })
      .where(eq(ingestionLog.id, logEntry.id));

    throw err;
  }
}

/**
 * Ingest from uploaded NDJSON file. Parses records and loads into database.
 */
export async function ingestFromFile(opts: FileIngestOptions): Promise<{
  recordsFetched: number;
  recordsInserted: number;
  recordsSkipped: number;
}> {
  const messages: string[] = [];
  const log = (msg: string) => {
    messages.push(`[${new Date().toISOString()}] ${msg}`);
    opts.onLog?.(msg);
  };
  const today = new Date().toISOString().split("T")[0];

  log("Starting file upload ingestion");

  const [logEntry] = await db
    .insert(ingestionLog)
    .values({
      ingestionDate: today,
      source: "file_upload",
      scope: "file_upload",
      scopeDetail: "Uploaded NDJSON file",
      status: "running",
    })
    .returning();

  log(`Ingestion log entry #${logEntry.id} created`);

  try {
    const records = opts.records;

    if (records.length === 0) {
      log("No records found in file. Nothing to ingest.");
      await db
        .update(ingestionLog)
        .set({ status: "success", completedAt: new Date(), recordsFetched: 0, logMessages: messages.join("\n") })
        .where(eq(ingestionLog.id, logEntry.id));
      return { recordsFetched: 0, recordsInserted: 0, recordsSkipped: 0 };
    }

    log(`Parsed ${records.length} usage records from file`);

    // Report summary stats
    const dates = records.map(r => r.day).filter(Boolean);
    const uniqueDates = [...new Set(dates)].sort();
    if (uniqueDates.length > 0) {
      log(`Date range: ${uniqueDates[0]} → ${uniqueDates[uniqueDates.length - 1]} (${uniqueDates.length} unique days)`);
    }
    const uniqueUsers = new Set(records.map(r => r.user_id));
    log(`Unique users in file: ${uniqueUsers.size}`);
    const orgIds = [...new Set(records.map(r => r.organization_id).filter(Boolean))];
    if (orgIds.length > 0) {
      log(`Organization IDs found: ${orgIds.join(", ")}`);
    }

    log("── Loading into database ──");
    const { inserted, skipped } = await loadRecords(records, logEntry.id, log);

    log(`═══ File Ingestion Summary ═══`);
    log(`Records: ${records.length} parsed, ${inserted} inserted, ${skipped} skipped`);
    log(`Status: SUCCESS`);

    await db
      .update(ingestionLog)
      .set({
        status: "success",
        completedAt: new Date(),
        recordsFetched: records.length,
        recordsInserted: inserted,
        recordsSkipped: skipped,
        logMessages: messages.join("\n"),
      })
      .where(eq(ingestionLog.id, logEntry.id));

    console.info(`File ingestion complete: ${inserted} records processed, ${skipped} duplicates skipped.`);

    return {
      recordsFetched: records.length,
      recordsInserted: inserted,
      recordsSkipped: skipped,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`File ingestion failed: ${message}`);
    log(`ERROR: ${message}`);

    await db
      .update(ingestionLog)
      .set({
        status: "error",
        completedAt: new Date(),
        errorMessage: message,
        logMessages: messages.join("\n"),
      })
      .where(eq(ingestionLog.id, logEntry.id));

    throw err;
  }
}

// ── CLI Entry Point ──
if (require.main === module) {
  (async () => {
    const { getGitHubConfig } = await import("@/lib/db/settings");
    const { token, enterpriseSlug: slug } = await getGitHubConfig();

    if (!slug || !token) {
      console.error("Configure GitHub token and enterprise slug via the Settings UI before running CLI ingest.");
      process.exit(1);
    }

    ingestCopilotUsage({ enterpriseSlug: slug, token })
      .then((result) => {
        console.info("Ingestion result:", result);
        process.exit(0);
      })
      .catch((err) => {
        console.error("Ingestion error:", err);
        process.exit(1);
      });
  })();
}
