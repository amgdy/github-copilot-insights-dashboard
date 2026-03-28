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
  dimIde,
  dimFeature,
  dimLanguage,
  dimModel,
  dimUser,
  ingestionLog,
} from "@/lib/db/schema";
import { fetchCopilotUsage } from "@/lib/github/copilot-api";
import type { CopilotUsageRecord } from "@/types/copilot-api";
import {
  transformToFactUsage,
  transformToFactFeatures,
  transformToFactIdes,
  transformToFactLanguages,
  transformToFactModels,
  transformToFactCli,
  transformToFactLanguageModels,
  extractUniqueIdes,
  extractUniqueFeatures,
  extractUniqueLanguages,
  extractUniqueModels,
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
}

interface FileIngestOptions {
  records: CopilotUsageRecord[];
  onLog?: (message: string) => void;
}

/**
 * Upsert dimension values and return a lookup map of name → id.
 */
async function ensureDimensions(records: CopilotUsageRecord[]) {
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

  return { ideMap, featureMap, langMap, modelMap };
}

/**
 * Ensure user dimension entries exist.
 */
async function ensureUsers(records: CopilotUsageRecord[]) {
  const seen = new Set<number>();
  for (const r of records) {
    if (seen.has(r.user_id)) continue;
    seen.add(r.user_id);

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
        orgId: null,
        isCurrent: true,
      });
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
  log: (msg: string) => void
): Promise<{ inserted: number; skipped: number }> {
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

  if (toProcess.length === 0) {
    log("All records are duplicates — nothing to process");
    return { inserted: 0, skipped };
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

  // Ensure dimensions exist
  const allRecords = toProcess.map((e) => e.record);
  log("Upserting dimension tables (IDEs, features, languages, models)…");
  const { ideMap, featureMap, langMap, modelMap } =
    await ensureDimensions(allRecords);
  log(`Dimensions loaded — IDEs: ${ideMap.size}, features: ${featureMap.size}, languages: ${langMap.size}, models: ${modelMap.size}`);

  // Ensure users exist
  const uniqueUsers = new Set(allRecords.map((r) => r.user_id)).size;
  log(`Upserting ${uniqueUsers} users…`);
  await ensureUsers(allRecords);
  log("User dimension updated");

  // Load fact tables
  log("Loading fact tables…");
  let inserted = 0;

  for (const { record } of toProcess) {
    const factRow = transformToFactUsage(record);

    log(`Processing record: user=${record.user_login}, date=${record.day}`);

    // Core usage fact
    await db
      .insert(factCopilotUsageDaily)
      .values({
        day: factRow.day,
        enterpriseId: factRow.enterpriseId,
        userId: factRow.userId,
        userLogin: factRow.userLogin,
        orgId: null,
        userInitiatedInteractionCount: factRow.userInitiatedInteractionCount,
        codeGenerationActivityCount: factRow.codeGenerationActivityCount,
        codeAcceptanceActivityCount: factRow.codeAcceptanceActivityCount,
        usedAgent: factRow.usedAgent,
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

  log(`All fact tables loaded — ${inserted} records processed, ${skipped} duplicates skipped`);
  return { inserted, skipped };
}

/**
 * Ingest from GitHub API. Fetches, transforms, and loads Copilot usage data.
 */
export async function ingestCopilotUsage(opts: IngestOptions): Promise<{
  recordsFetched: number;
  recordsInserted: number;
  recordsSkipped: number;
  apiRequests: number;
}> {
  const messages: string[] = [];
  const log = (msg: string) => {
    messages.push(`[${new Date().toISOString()}] ${msg}`);
    opts.onLog?.(msg);
  };
  const today = new Date().toISOString().split("T")[0];

  log(`Starting ingestion for enterprise "${opts.enterpriseSlug}"`);

  const [logEntry] = await db
    .insert(ingestionLog)
    .values({
      ingestionDate: today,
      source: opts.source ?? "api",
      status: "running",
    })
    .returning();

  log("Ingestion log entry created");

  try {
    log("Fetching Copilot usage data from GitHub API…");
    const { records, apiRequestCount } = await fetchCopilotUsage({
      enterpriseSlug: opts.enterpriseSlug,
      token: opts.token,
      day: opts.day,
    });

    log(`GitHub API responded — ${apiRequestCount} API requests made`);

    if (records.length === 0) {
      log("No records returned from GitHub API. Nothing to ingest.");
      console.info("No records fetched. Nothing to ingest.");
      await db
        .update(ingestionLog)
        .set({ status: "success", completedAt: new Date(), recordsFetched: 0, logMessages: messages.join("\n") })
        .where(eq(ingestionLog.id, logEntry.id));
      return { recordsFetched: 0, recordsInserted: 0, recordsSkipped: 0, apiRequests: apiRequestCount };
    }

    log(`Fetched ${records.length} usage records`);

    const { inserted, skipped } = await loadRecords(records, logEntry.id, log);

    log(`Ingestion complete — fetched: ${records.length}, inserted: ${inserted}, skipped: ${skipped}, API requests: ${apiRequestCount}`);

    await db
      .update(ingestionLog)
      .set({
        status: "success",
        completedAt: new Date(),
        recordsFetched: records.length,
        recordsInserted: inserted,
        recordsSkipped: skipped,
        apiRequests: apiRequestCount,
        logMessages: messages.join("\n"),
      })
      .where(eq(ingestionLog.id, logEntry.id));

    console.info(`Ingestion complete: ${inserted} records processed, ${skipped} duplicates skipped.`);

    return {
      recordsFetched: records.length,
      recordsInserted: inserted,
      recordsSkipped: skipped,
      apiRequests: apiRequestCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Ingestion failed: ${message}`);
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
      status: "running",
    })
    .returning();

  log("Ingestion log entry created");

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

    const { inserted, skipped } = await loadRecords(records, logEntry.id, log);

    log(`Ingestion complete — records: ${records.length}, inserted: ${inserted}, skipped: ${skipped}`);

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
  const slug = process.env.GITHUB_ENTERPRISE_SLUG;
  const token = process.env.GITHUB_TOKEN;

  if (!slug || !token) {
    console.error("Set GITHUB_ENTERPRISE_SLUG and GITHUB_TOKEN environment variables for CLI mode.");
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
}
