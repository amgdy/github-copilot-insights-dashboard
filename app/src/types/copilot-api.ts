/**
 * TypeScript types matching the GitHub Copilot Usage Metrics API response.
 *
 * Based on the latest Copilot Usage Metrics API (preview, API version 2026-03-10).
 * Docs: https://docs.github.com/enterprise-cloud@latest/rest/copilot/copilot-usage-metrics
 * Schema: https://docs.github.com/enterprise-cloud@latest/copilot/reference/copilot-usage-metrics/example-schema
 */

// ── Report Envelope (returned by the API endpoint) ──

export interface CopilotMetricsReportResponse {
  download_links: string[];
  report_day?: string;
  report_start_day?: string;
  report_end_day?: string;
}

// ── User-Level Record (each NDJSON line in a downloaded report) ──

export interface CopilotUsageRecord {
  day: string;
  enterprise_id: string;
  user_id: number;
  user_login: string;
  user_initiated_interaction_count: number;
  code_generation_activity_count: number;
  code_acceptance_activity_count: number;
  used_agent: boolean;
  used_chat: boolean;
  used_cli: boolean;
  loc_suggested_to_add_sum: number;
  loc_suggested_to_delete_sum: number;
  loc_added_sum: number;
  loc_deleted_sum: number;

  // Chat mode breakdowns
  chat_panel_agent_mode?: number;
  chat_panel_ask_mode?: number;
  chat_panel_custom_mode?: number;
  chat_panel_edit_mode?: number;
  chat_panel_unknown_mode?: number;

  // Breakdown arrays / objects
  totals_by_ide: TotalsByIde[];
  totals_by_feature: TotalsByFeature[];
  totals_by_language_feature: TotalsByLanguageFeature[];
  totals_by_language_model: TotalsByLanguageModel[];
  totals_by_model_feature: TotalsByModelFeature[];
  totals_by_cli?: TotalsByCli;
}

export interface TotalsByIde {
  ide: string;
  user_initiated_interaction_count: number;
  code_generation_activity_count: number;
  code_acceptance_activity_count: number;
  loc_added_sum?: number;
  loc_deleted_sum?: number;
  loc_suggested_to_add_sum?: number;
  loc_suggested_to_delete_sum?: number;
  last_known_ide_version?: { ide_version: string; sampled_at: string };
  last_known_plugin_version?: { plugin: string; plugin_version: string; sampled_at: string };
}

export interface TotalsByFeature {
  feature: string;
  user_initiated_interaction_count: number;
  code_generation_activity_count: number;
  code_acceptance_activity_count: number;
  loc_added_sum?: number;
  loc_deleted_sum?: number;
  loc_suggested_to_add_sum?: number;
  loc_suggested_to_delete_sum?: number;
}

export interface TotalsByLanguageFeature {
  language: string;
  feature: string;
  user_initiated_interaction_count?: number;
  code_generation_activity_count: number;
  code_acceptance_activity_count: number;
  loc_added_sum?: number;
  loc_deleted_sum?: number;
  loc_suggested_to_add_sum?: number;
  loc_suggested_to_delete_sum?: number;
}

export interface TotalsByLanguageModel {
  language: string;
  model: string;
  code_generation_activity_count: number;
  code_acceptance_activity_count: number;
  loc_suggested_to_add_sum?: number;
  loc_suggested_to_delete_sum?: number;
  loc_added_sum?: number;
  loc_deleted_sum?: number;
}

export interface TotalsByModelFeature {
  model: string;
  feature: string;
  user_initiated_interaction_count: number;
  code_generation_activity_count: number;
  code_acceptance_activity_count: number;
  loc_suggested_to_add_sum?: number;
  loc_suggested_to_delete_sum?: number;
  loc_added_sum?: number;
  loc_deleted_sum?: number;
}

export interface TotalsByCli {
  session_count: number;
  request_count: number;
  prompt_count: number;
  last_known_cli_version?: { cli_version: string; sampled_at: string };
  token_usage: CliTokenUsage;
}

export interface CliTokenUsage {
  prompt_tokens_sum: number;
  output_tokens_sum: number;
  avg_tokens_per_request: number;
}

/** Raw API response is an array of usage records (NDJSON lines parsed) */
export type CopilotUsageApiResponse = CopilotUsageRecord[];
