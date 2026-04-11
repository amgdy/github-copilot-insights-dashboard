/**
 * Transform raw Copilot usage API records into normalized fact/dimension rows.
 *
 * Updated for the latest Copilot Usage Metrics API (2026-03-10).
 */

import { createHash } from "crypto";
import type { CopilotUsageRecord, CopilotAggregateRecord } from "@/types/copilot-api";

// ── Dimension Extraction ──

/** Extract unique organization IDs from records. Returns numeric IDs (strings parsed to ints). */
export function extractUniqueOrgIds(records: CopilotUsageRecord[]): number[] {
  const orgIds = new Set<number>();
  for (const r of records) {
    if (r.organization_id) {
      const id = parseInt(String(r.organization_id), 10);
      if (id > 0) orgIds.add(id);
    }
  }
  return Array.from(orgIds);
}

export function extractUniqueIdes(records: CopilotUsageRecord[]): string[] {
  const ides = new Set<string>();
  for (const r of records) {
    for (const ide of r.totals_by_ide ?? []) {
      if (ide.ide) ides.add(ide.ide);
    }
  }
  return Array.from(ides);
}

export function extractUniqueFeatures(records: CopilotUsageRecord[]): string[] {
  const features = new Set<string>();
  for (const r of records) {
    for (const f of r.totals_by_feature ?? []) {
      if (f.feature) features.add(f.feature);
    }
  }
  return Array.from(features);
}

export function extractUniqueLanguages(records: CopilotUsageRecord[]): string[] {
  const langs = new Set<string>();
  for (const r of records) {
    for (const lf of r.totals_by_language_feature ?? []) {
      if (lf.language) langs.add(lf.language);
    }
    for (const lm of r.totals_by_language_model ?? []) {
      if (lm.language) langs.add(lm.language);
    }
  }
  return Array.from(langs);
}

export function extractUniqueModels(records: CopilotUsageRecord[]): string[] {
  const models = new Set<string>();
  for (const r of records) {
    for (const lm of r.totals_by_language_model ?? []) {
      if (lm.model) models.add(lm.model);
    }
    for (const mf of r.totals_by_model_feature ?? []) {
      if (mf.model) models.add(mf.model);
    }
  }
  return Array.from(models);
}

// ── Fact Row Interfaces ──

export interface FactUsageDailyRow {
  day: string;
  enterpriseId: number;
  organizationId: number | null;
  userId: number;
  userLogin: string;
  userInitiatedInteractionCount: number;
  codeGenerationActivityCount: number;
  codeAcceptanceActivityCount: number;
  usedAgent: boolean;
  usedCopilotCodingAgent: boolean;
  usedChat: boolean;
  usedCli: boolean;
  locSuggestedToAddSum: number;
  locSuggestedToDeleteSum: number;
  locAddedSum: number;
  locDeletedSum: number;
}

export interface FactFeatureRow {
  day: string;
  userId: number;
  featureName: string;
  userInitiatedInteractionCount: number;
  codeGenerationActivityCount: number;
  codeAcceptanceActivityCount: number;
}

export interface FactIdeRow {
  day: string;
  userId: number;
  ideName: string;
  userInitiatedInteractionCount: number;
  codeGenerationActivityCount: number;
  codeAcceptanceActivityCount: number;
}

export interface FactLanguageRow {
  day: string;
  userId: number;
  languageName: string;
  featureName: string;
  userInitiatedInteractionCount: number;
  codeGenerationActivityCount: number;
  codeAcceptanceActivityCount: number;
}

export interface FactModelRow {
  day: string;
  userId: number;
  modelName: string;
  featureName: string;
  userInitiatedInteractionCount: number;
  codeGenerationActivityCount: number;
  codeAcceptanceActivityCount: number;
}

export interface FactLanguageModelRow {
  day: string;
  userId: number;
  languageName: string;
  modelName: string;
  codeGenerationActivityCount: number;
  codeAcceptanceActivityCount: number;
}

export interface FactCliRow {
  day: string;
  userId: number;
  cliVersion: string;
  sessionCount: number;
  requestCount: number;
  promptCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ── Transform Functions ──

export function transformToFactUsage(record: CopilotUsageRecord): FactUsageDailyRow {
  return {
    day: record.day,
    enterpriseId: parseInt(String(record.enterprise_id), 10) || 0,
    organizationId: record.organization_id ? parseInt(String(record.organization_id), 10) || null : null,
    userId: record.user_id,
    userLogin: record.user_login,
    userInitiatedInteractionCount: record.user_initiated_interaction_count ?? 0,
    codeGenerationActivityCount: record.code_generation_activity_count ?? 0,
    codeAcceptanceActivityCount: record.code_acceptance_activity_count ?? 0,
    usedAgent: record.used_agent ?? false,
    usedCopilotCodingAgent: record.used_copilot_coding_agent ?? false,
    usedChat: record.used_chat ?? false,
    usedCli: record.used_cli ?? false,
    locSuggestedToAddSum: record.loc_suggested_to_add_sum ?? 0,
    locSuggestedToDeleteSum: record.loc_suggested_to_delete_sum ?? 0,
    locAddedSum: record.loc_added_sum ?? 0,
    locDeletedSum: record.loc_deleted_sum ?? 0,
  };
}

export function transformToFactFeatures(record: CopilotUsageRecord): FactFeatureRow[] {
  return (record.totals_by_feature ?? []).map((f) => ({
    day: record.day,
    userId: record.user_id,
    featureName: f.feature,
    userInitiatedInteractionCount: f.user_initiated_interaction_count ?? 0,
    codeGenerationActivityCount: f.code_generation_activity_count ?? 0,
    codeAcceptanceActivityCount: f.code_acceptance_activity_count ?? 0,
  }));
}

export function transformToFactIdes(record: CopilotUsageRecord): FactIdeRow[] {
  return (record.totals_by_ide ?? []).map((ide) => ({
    day: record.day,
    userId: record.user_id,
    ideName: ide.ide,
    userInitiatedInteractionCount: ide.user_initiated_interaction_count ?? 0,
    codeGenerationActivityCount: ide.code_generation_activity_count ?? 0,
    codeAcceptanceActivityCount: ide.code_acceptance_activity_count ?? 0,
  }));
}

export function transformToFactLanguages(record: CopilotUsageRecord): FactLanguageRow[] {
  return (record.totals_by_language_feature ?? []).map((lf) => ({
    day: record.day,
    userId: record.user_id,
    languageName: lf.language,
    featureName: lf.feature,
    userInitiatedInteractionCount: lf.user_initiated_interaction_count ?? 0,
    codeGenerationActivityCount: lf.code_generation_activity_count ?? 0,
    codeAcceptanceActivityCount: lf.code_acceptance_activity_count ?? 0,
  }));
}

export function transformToFactModels(record: CopilotUsageRecord): FactModelRow[] {
  return (record.totals_by_model_feature ?? []).map((mf) => ({
    day: record.day,
    userId: record.user_id,
    modelName: mf.model,
    featureName: mf.feature,
    userInitiatedInteractionCount: mf.user_initiated_interaction_count ?? 0,
    codeGenerationActivityCount: mf.code_generation_activity_count ?? 0,
    codeAcceptanceActivityCount: mf.code_acceptance_activity_count ?? 0,
  }));
}

export function transformToFactCli(record: CopilotUsageRecord): FactCliRow[] {
  const cli = record.totals_by_cli;
  if (!cli) return [];

  const promptTokens = cli.token_usage?.prompt_tokens_sum ?? 0;
  const outputTokens = cli.token_usage?.output_tokens_sum ?? 0;

  return [{
    day: record.day,
    userId: record.user_id,
    cliVersion: cli.last_known_cli_version?.cli_version ?? "unknown",
    sessionCount: cli.session_count ?? 0,
    requestCount: cli.request_count ?? 0,
    promptCount: cli.prompt_count ?? 0,
    promptTokens,
    completionTokens: outputTokens,
    totalTokens: promptTokens + outputTokens,
  }];
}

export function transformToFactLanguageModels(record: CopilotUsageRecord): FactLanguageModelRow[] {
  return (record.totals_by_language_model ?? []).map((lm) => ({
    day: record.day,
    userId: record.user_id,
    languageName: lm.language,
    modelName: lm.model,
    codeGenerationActivityCount: lm.code_generation_activity_count ?? 0,
    codeAcceptanceActivityCount: lm.code_acceptance_activity_count ?? 0,
  }));
}

// ── Record Hashing (Deduplication) ──

/**
 * Recursively sort object keys to produce a stable JSON string
 * regardless of property insertion order across API calls.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((v) => stableStringify(v)).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const parts = sortedKeys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]));
    return "{" + parts.join(",") + "}";
  }
  return JSON.stringify(value);
}

/**
 * Compute a SHA-256 content hash for a Copilot usage record.
 * Uses stable key-sorted JSON serialization so the hash is deterministic
 * regardless of property order in the API response.
 */
export function computeRecordHash(record: CopilotUsageRecord): string {
  const canonical = stableStringify(record);
  return createHash("sha256").update(canonical).digest("hex");
}

// ── Aggregate Record Transform ──

export interface FactOrgAggregateDailyRow {
  day: string;
  orgLogin: string | null;
  scope: "enterprise" | "organization";
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  monthlyActiveAgentUsers: number;
  monthlyActiveChatUsers: number;
  dailyActiveCliUsers: number;
  prTotalCreated: number;
  prTotalReviewed: number;
  prTotalMerged: number;
  prMedianMinutesToMerge: string | null;
  prTotalSuggestions: number;
  prTotalAppliedSuggestions: number;
  prTotalCreatedByCopilot: number;
  prTotalReviewedByCopilot: number;
  prTotalMergedCreatedByCopilot: number;
  prTotalMergedReviewedByCopilot: number;
  prMedianMinutesToMergeCopilotAuthored: string | null;
  prMedianMinutesToMergeCopilotReviewed: string | null;
  prTotalCopilotSuggestions: number;
  prTotalCopilotAppliedSuggestions: number;
}

export function transformToFactOrgAggregate(
  record: CopilotAggregateRecord
): FactOrgAggregateDailyRow {
  const pr = record.pull_requests;
  return {
    day: record.day,
    orgLogin: record._orgLogin ?? null,
    scope: record._scope ?? "organization",
    dailyActiveUsers: record.daily_active_users ?? 0,
    weeklyActiveUsers: record.weekly_active_users ?? 0,
    monthlyActiveUsers: record.monthly_active_users ?? 0,
    monthlyActiveAgentUsers: record.monthly_active_agent_users ?? 0,
    monthlyActiveChatUsers: record.monthly_active_chat_users ?? 0,
    dailyActiveCliUsers: record.daily_active_cli_users ?? 0,
    prTotalCreated: pr?.total_created ?? 0,
    prTotalReviewed: pr?.total_reviewed ?? 0,
    prTotalMerged: pr?.total_merged ?? 0,
    prMedianMinutesToMerge: pr?.median_minutes_to_merge != null
      ? String(pr.median_minutes_to_merge)
      : null,
    prTotalSuggestions: pr?.total_suggestions ?? 0,
    prTotalAppliedSuggestions: pr?.total_applied_suggestions ?? 0,
    prTotalCreatedByCopilot: pr?.total_created_by_copilot ?? 0,
    prTotalReviewedByCopilot: pr?.total_reviewed_by_copilot ?? 0,
    prTotalMergedCreatedByCopilot: pr?.total_merged_created_by_copilot ?? 0,
    prTotalMergedReviewedByCopilot: pr?.total_merged_reviewed_by_copilot ?? 0,
    prMedianMinutesToMergeCopilotAuthored:
      pr?.median_minutes_to_merge_copilot_authored != null
        ? String(pr.median_minutes_to_merge_copilot_authored)
        : null,
    prMedianMinutesToMergeCopilotReviewed:
      pr?.median_minutes_to_merge_copilot_reviewed != null
        ? String(pr.median_minutes_to_merge_copilot_reviewed)
        : null,
    prTotalCopilotSuggestions: pr?.total_copilot_suggestions ?? 0,
    prTotalCopilotAppliedSuggestions: pr?.total_copilot_applied_suggestions ?? 0,
  };
}
