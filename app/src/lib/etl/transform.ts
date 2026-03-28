/**
 * Transform raw Copilot usage API records into normalized fact/dimension rows.
 *
 * Updated for the latest Copilot Usage Metrics API (2026-03-10).
 */

import { createHash } from "crypto";
import type { CopilotUsageRecord } from "@/types/copilot-api";

// ── Dimension Extraction ──

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
  userId: number;
  userLogin: string;
  userInitiatedInteractionCount: number;
  codeGenerationActivityCount: number;
  codeAcceptanceActivityCount: number;
  usedAgent: boolean;
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
    userId: record.user_id,
    userLogin: record.user_login,
    userInitiatedInteractionCount: record.user_initiated_interaction_count ?? 0,
    codeGenerationActivityCount: record.code_generation_activity_count ?? 0,
    codeAcceptanceActivityCount: record.code_acceptance_activity_count ?? 0,
    usedAgent: record.used_agent ?? false,
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
