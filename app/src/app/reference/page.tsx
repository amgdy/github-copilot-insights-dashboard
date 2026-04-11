"use client";

import { useState } from "react";

/* ── Metric definitions ── */

interface MetricDef {
  name: string;
  page: string;
  chart: string;
  description: string;
  calculation: string;
  source: string;
  notes?: string;
}

const METRICS: MetricDef[] = [
  // ── Copilot Usage KPIs ──
  {
    name: "IDE Active Users",
    page: "Copilot Usage",
    chart: "KPI Card",
    description: "Total unique users who interacted with Copilot in any way during the selected period.",
    calculation: "COUNT(DISTINCT user_id) from fact_copilot_usage_daily within the date range.",
    source: "fact_copilot_usage_daily",
  },
  {
    name: "Agent Adoption Rate",
    page: "Copilot Usage",
    chart: "KPI Card",
    description: "Percentage of active users who used Copilot in agent mode at least once.",
    calculation: "ROUND((agent_users / active_users) × 100). Where agent_users = COUNT(DISTINCT user_id) WHERE used_agent = true.",
    source: "fact_copilot_usage_daily (used_agent flag)",
  },
  {
    name: "Most Used Chat Model",
    page: "Copilot Usage",
    chart: "KPI Card",
    description: "The AI model with the highest total number of user-initiated chat interactions.",
    calculation: "Model with MAX(SUM(user_initiated_interaction_count)) grouped by model, across all features.",
    source: "fact_user_model_daily → dim_model",
  },

  // ── Copilot Usage Charts ──
  {
    name: "Daily Active Users",
    page: "Copilot Usage",
    chart: "Area / Line Chart",
    description: "Number of unique users who used Copilot each day.",
    calculation: "COUNT(DISTINCT user_id) per day from fact_copilot_usage_daily, ordered by date.",
    source: "fact_copilot_usage_daily",
  },
  {
    name: "Weekly Active Users",
    page: "Copilot Usage",
    chart: "Bar Chart",
    description: "Number of unique users per ISO week (Monday–Sunday).",
    calculation: "COUNT(DISTINCT user_id) grouped by DATE_TRUNC('week', day).",
    source: "fact_copilot_usage_daily",
  },
  {
    name: "Average Chat Requests per Active User",
    page: "Copilot Usage",
    chart: "Area / Line Chart",
    description: "Average number of user-initiated interactions per active user per day.",
    calculation: "SUM(user_initiated_interaction_count) / COUNT(DISTINCT user_id) per day.",
    source: "fact_copilot_usage_daily",
  },
  {
    name: "Requests per Chat Mode",
    page: "Copilot Usage",
    chart: "Stacked Bar Chart",
    description: "Daily breakdown of user-initiated requests by Copilot feature (Ask, Agent, Edit, Custom, Inline, Plan, etc.).",
    calculation: "SUM(user_initiated_interaction_count) per day per feature, pivoted so each feature is a column.",
    source: "fact_user_feature_daily → dim_feature",
    notes: "Features are mapped to friendly labels (e.g. chat_panel_agent_mode → Agent).",
  },
  {
    name: "Code Completions (Suggested vs Accepted)",
    page: "Copilot Usage",
    chart: "Dual Line / Area Chart",
    description: "Daily count of inline code completion suggestions shown and accepted by users.",
    calculation: "SUM(code_generation_activity_count) for 'suggested' and SUM(code_acceptance_activity_count) for 'accepted', filtered to the code_completion feature.",
    source: "fact_user_feature_daily → dim_feature (feature = 'code_completion')",
  },
  {
    name: "Code Completions Acceptance Rate",
    page: "Copilot Usage",
    chart: "Area / Line Chart",
    description: "Percentage of code completion suggestions that were accepted each day.",
    calculation: "ROUND((accepted / suggested) × 100, 1) per day. Returns 0 if suggested = 0.",
    source: "Derived from Code Completions data",
  },
  {
    name: "Model Usage per Day",
    page: "Copilot Usage",
    chart: "Stacked Area Chart",
    description: "Daily breakdown of all requests by AI model (e.g. GPT-4, Claude, Gemini).",
    calculation: "SUM(user_initiated_interaction_count + code_generation_activity_count) per day per model, pivoted.",
    source: "fact_user_model_daily → dim_model",
  },
  {
    name: "Chat Model Usage (Donut)",
    page: "Copilot Usage",
    chart: "Doughnut Chart",
    description: "Overall distribution of user-initiated chat interactions across all AI models.",
    calculation: "SUM(user_initiated_interaction_count) grouped by model. Top 8 shown, rest grouped as 'Other'.",
    source: "fact_user_model_daily → dim_model",
  },
  {
    name: "Model Usage per Chat Mode",
    page: "Copilot Usage",
    chart: "Horizontal Stacked Bar Chart",
    description: "For each AI model, how many requests came from each Copilot feature/mode.",
    calculation: "SUM(user_initiated_interaction_count) grouped by model × feature, pivoted with model as rows and features as stacked segments.",
    source: "fact_user_model_daily → dim_model × dim_feature",
  },
  {
    name: "Language Usage per Day",
    page: "Copilot Usage",
    chart: "Stacked Area Chart",
    description: "Daily breakdown of code generation activity by programming language.",
    calculation: "SUM(code_generation_activity_count) per day per language, pivoted.",
    source: "fact_user_language_daily → dim_language",
  },
  {
    name: "Language Usage (Donut)",
    page: "Copilot Usage",
    chart: "Doughnut Chart",
    description: "Overall distribution of code generation across programming languages.",
    calculation: "SUM(code_generation_activity_count) grouped by language. Top 8 shown, rest as 'Other'.",
    source: "fact_user_language_daily → dim_language",
  },
  {
    name: "Model Usage per Language",
    page: "Copilot Usage",
    chart: "Horizontal Stacked Bar Chart",
    description: "For each language, which AI models were used for code generation.",
    calculation: "SUM(code_generation_activity_count) grouped by language × model, pivoted.",
    source: "fact_user_language_model_daily → dim_language × dim_model",
  },

  // ── Agent Impact KPIs ──
  {
    name: "Agent Users",
    page: "Agent Impact",
    chart: "KPI Card",
    description: "Total unique users who used Copilot in agent mode during the selected period.",
    calculation: "COUNT(DISTINCT user_id) WHERE used_agent = true.",
    source: "fact_copilot_usage_daily",
  },
  {
    name: "Agent Adoption Rate (Agent Page)",
    page: "Agent Impact",
    chart: "KPI Card",
    description: "Percentage of all active IDE users who used agent mode.",
    calculation: "ROUND((agent_users / active_users) × 100). Same logic as dashboard KPI.",
    source: "fact_copilot_usage_daily",
  },
  {
    name: "Agent Acceptance Rate",
    page: "Agent Impact",
    chart: "KPI Card",
    description: "Percentage of code generated by agent mode that was accepted by users.",
    calculation: "ROUND((agent_code_accept / agent_code_gen) × 100, 1). Only counts rows where used_agent = true.",
    source: "fact_copilot_usage_daily (code_acceptance_activity_count / code_generation_activity_count WHERE used_agent)",
  },
  {
    name: "Agent LOC Added",
    page: "Agent Impact",
    chart: "KPI Card",
    description: "Total lines of code added from agent-mode interactions.",
    calculation: "SUM(loc_added_sum) WHERE used_agent = true.",
    source: "fact_copilot_usage_daily",
  },

  // ── Agent Impact Charts ──
  {
    name: "Agent Users Over Time",
    page: "Agent Impact",
    chart: "Dual Area Chart",
    description: "Daily count of agent users overlaid with total active users, showing agent penetration.",
    calculation: "Two series: (1) COUNT(DISTINCT user_id) WHERE used_agent = true per day; (2) COUNT(DISTINCT user_id) per day (all users).",
    source: "fact_copilot_usage_daily",
  },
  {
    name: "Weekly Agent Adoption Rate",
    page: "Agent Impact",
    chart: "Bar Chart (% axis)",
    description: "Adoption rate computed per ISO week to smooth out daily variance.",
    calculation: "Per week: ROUND((COUNT(DISTINCT user_id WHERE used_agent) / COUNT(DISTINCT user_id)) × 100, 1).",
    source: "fact_copilot_usage_daily, grouped by DATE_TRUNC('week', day)",
  },
  {
    name: "Agent Mode Requests Over Time",
    page: "Agent Impact",
    chart: "Stacked Area Chart",
    description: "Daily breakdown of agent-related interactions by specific agent feature.",
    calculation: "SUM(user_initiated_interaction_count) per day per feature, filtered to features matching '%agent%'.",
    source: "fact_user_feature_daily → dim_feature (LIKE '%agent%')",
  },
  {
    name: "Agent Model Usage (Donut)",
    page: "Agent Impact",
    chart: "Doughnut Chart",
    description: "Distribution of AI models used specifically in agent mode.",
    calculation: "SUM(user_initiated_interaction_count) grouped by model, filtered to agent feature IDs.",
    source: "fact_user_model_daily → dim_model (WHERE feature_id IN agent features)",
  },
  {
    name: "Agent vs Non-Agent Code Generation",
    page: "Agent Impact",
    chart: "Stacked Bar Chart",
    description: "Daily comparison of code generation from agent users vs non-agent users.",
    calculation: "Two series: SUM(code_generation_activity_count) WHERE used_agent = true, and WHERE used_agent = false, per day.",
    source: "fact_copilot_usage_daily",
  },
  {
    name: "Top Agent Users",
    page: "Agent Impact",
    chart: "Sortable Table",
    description: "Leaderboard of the most active agent mode users, ranked by interactions.",
    calculation: "Per user (WHERE used_agent = true): COUNT(DISTINCT day) for days active, SUM(user_initiated_interaction_count) for interactions, SUM(code_generation_activity_count), SUM(code_acceptance_activity_count), SUM(loc_added_sum). Limited to top 200.",
    source: "fact_copilot_usage_daily",
  },

  // ── Agent Impact: IDE Agent vs Coding Agent ──
  {
    name: "IDE Agent Users",
    page: "Agent Impact",
    chart: "KPI Card",
    description: "Users who used Copilot in-IDE agent mode (VS Code, JetBrains, etc.) but not the GitHub cloud coding agent.",
    calculation: "COUNT(DISTINCT user_id) WHERE used_agent = true AND used_copilot_coding_agent = false.",
    source: "fact_copilot_usage_daily",
  },
  {
    name: "Coding Agent Users",
    page: "Agent Impact",
    chart: "KPI Card",
    description: "Users who used the GitHub cloud coding agent (Copilot Coding Agent) during the selected period.",
    calculation: "COUNT(DISTINCT user_id) WHERE used_copilot_coding_agent = true.",
    source: "fact_copilot_usage_daily",
  },
  {
    name: "IDE Agent Interactions",
    page: "Agent Impact",
    chart: "KPI Card",
    description: "Total user-initiated interactions from in-IDE agent mode users.",
    calculation: "SUM(user_initiated_interaction_count) WHERE used_agent = true AND used_copilot_coding_agent = false.",
    source: "fact_copilot_usage_daily",
  },
  {
    name: "Coding Agent Interactions",
    page: "Agent Impact",
    chart: "KPI Card",
    description: "Total user-initiated interactions from GitHub cloud coding agent users.",
    calculation: "SUM(user_initiated_interaction_count) WHERE used_copilot_coding_agent = true.",
    source: "fact_copilot_usage_daily",
  },

  // ── PR & Autofix: Copilot Code Review ──
  {
    name: "PRs Reviewed by Copilot",
    page: "PR & Autofix",
    chart: "KPI Card",
    description: "Total pull requests reviewed by Copilot code review during the selected period.",
    calculation: "SUM(pr_total_reviewed_by_copilot) from fact_org_aggregate_daily.",
    source: "fact_org_aggregate_daily (Copilot Usage Metrics API aggregate endpoint)",
  },
  {
    name: "Copilot Review Suggestions",
    page: "PR & Autofix",
    chart: "KPI Card",
    description: "Total code review suggestions generated by Copilot, with the percentage that were applied.",
    calculation: "SUM(pr_total_copilot_suggestions). Apply rate = ROUND((applied / suggestions) × 100, 1).",
    source: "fact_org_aggregate_daily",
  },
  {
    name: "PRs Created by Copilot",
    page: "PR & Autofix",
    chart: "KPI Card",
    description: "Pull requests authored by Copilot, with percentage of all PRs created.",
    calculation: "SUM(pr_total_created_by_copilot). Percentage = ROUND((copilot_created / total_created) × 100).",
    source: "fact_org_aggregate_daily",
  },
  {
    name: "Copilot PRs Merged",
    page: "PR & Autofix",
    chart: "KPI Card",
    description: "Number of Copilot-authored pull requests that were merged.",
    calculation: "SUM(pr_total_merged_created_by_copilot) from fact_org_aggregate_daily.",
    source: "fact_org_aggregate_daily",
  },

  // ── CLI Impact KPIs ──
  {
    name: "CLI Users",
    page: "CLI Impact",
    chart: "KPI Card",
    description: "Total unique users who used GitHub Copilot CLI during the selected period.",
    calculation: "COUNT(DISTINCT user_id) WHERE used_cli = true.",
    source: "fact_copilot_usage_daily",
  },
  {
    name: "CLI Adoption Rate",
    page: "CLI Impact",
    chart: "KPI Card",
    description: "Percentage of all active IDE users who used the CLI.",
    calculation: "ROUND((cli_users / active_users) × 100).",
    source: "fact_copilot_usage_daily",
  },
  {
    name: "CLI Acceptance Rate",
    page: "CLI Impact",
    chart: "KPI Card",
    description: "Percentage of code generated by CLI users that was accepted.",
    calculation: "ROUND((SUM(code_acceptance_activity_count) / SUM(code_generation_activity_count)) × 100, 1) WHERE used_cli = true.",
    source: "fact_copilot_usage_daily",
  },
  {
    name: "CLI Sessions",
    page: "CLI Impact",
    chart: "KPI Card",
    description: "Total CLI session count from the totals_by_cli API field.",
    calculation: "SUM(session_count) from fact_cli_daily.",
    source: "fact_cli_daily",
  },
  {
    name: "CLI Requests",
    page: "CLI Impact",
    chart: "KPI Card",
    description: "Total CLI request count.",
    calculation: "SUM(request_count) from fact_cli_daily.",
    source: "fact_cli_daily",
  },
  {
    name: "CLI Prompt Tokens",
    page: "CLI Impact",
    chart: "KPI Card",
    description: "Total prompt tokens consumed by CLI interactions.",
    calculation: "SUM(prompt_tokens) from fact_cli_daily.",
    source: "fact_cli_daily",
  },
  {
    name: "CLI Completion Tokens",
    page: "CLI Impact",
    chart: "KPI Card",
    description: "Total completion/output tokens produced by CLI interactions.",
    calculation: "SUM(completion_tokens) from fact_cli_daily.",
    source: "fact_cli_daily",
  },

  // ── CLI Impact Charts ──
  {
    name: "CLI Users Over Time",
    page: "CLI Impact",
    chart: "Dual Area Chart",
    description: "Daily count of CLI users overlaid with total active users, showing CLI penetration.",
    calculation: "Two series: (1) COUNT(DISTINCT user_id) WHERE used_cli = true per day; (2) COUNT(DISTINCT user_id) per day.",
    source: "fact_copilot_usage_daily",
  },
  {
    name: "CLI Sessions & Requests",
    page: "CLI Impact",
    chart: "Dual Line Chart",
    description: "Daily session and request counts from CLI interactions.",
    calculation: "SUM(session_count) and SUM(request_count) per day from fact_cli_daily.",
    source: "fact_cli_daily",
  },
  {
    name: "Token Consumption",
    page: "CLI Impact",
    chart: "Stacked Bar Chart",
    description: "Daily prompt tokens vs completion tokens consumed by CLI.",
    calculation: "SUM(prompt_tokens) and SUM(completion_tokens) per day from fact_cli_daily.",
    source: "fact_cli_daily",
  },
  {
    name: "Weekly CLI Adoption Rate",
    page: "CLI Impact",
    chart: "Bar Chart (% axis)",
    description: "CLI adoption rate per ISO week.",
    calculation: "Per week: ROUND((COUNT(DISTINCT user_id WHERE used_cli) / COUNT(DISTINCT user_id)) × 100, 1).",
    source: "fact_copilot_usage_daily, grouped by DATE_TRUNC('week', day)",
  },
  {
    name: "CLI Version Distribution",
    page: "CLI Impact",
    chart: "Doughnut Chart",
    description: "Distribution of CLI sessions across different CLI versions.",
    calculation: "SUM(session_count) grouped by cli_version from fact_cli_daily.",
    source: "fact_cli_daily",
  },
  {
    name: "CLI vs Non-CLI Code Generation",
    page: "CLI Impact",
    chart: "Stacked Bar Chart",
    description: "Daily comparison of code generation from CLI users vs non-CLI users.",
    calculation: "Two series: SUM(code_generation_activity_count) WHERE used_cli = true, and WHERE used_cli = false, per day.",
    source: "fact_copilot_usage_daily",
  },
  {
    name: "CLI vs Non-CLI Productivity",
    page: "CLI Impact",
    chart: "Dual Line Chart",
    description: "Average code generation per user comparing CLI users vs non-CLI users.",
    calculation: "Per day: AVG(code_generation_activity_count) for CLI users vs non-CLI users.",
    source: "fact_copilot_usage_daily",
  },
  {
    name: "Top CLI Users",
    page: "CLI Impact",
    chart: "Sortable Table",
    description: "Leaderboard of most active CLI users, ranked by days active.",
    calculation: "Per user (WHERE used_cli = true): COUNT(DISTINCT day), SUM(sessions), SUM(requests), SUM(code_generation_activity_count), SUM(code_acceptance_activity_count), acceptance rate, SUM(loc_added_sum), SUM(total_tokens). Limited to top 200.",
    source: "fact_copilot_usage_daily + fact_cli_daily",
  },

  // ── Code Generation KPIs ──
  {
    name: "Lines of Code Changed with AI",
    page: "Code Generation",
    chart: "KPI Card",
    description: "Total lines of code added plus deleted via Copilot (user-initiated + agent-initiated) during the selected period.",
    calculation: "SUM of all added and deleted LOC extracted from raw_copilot_usage JSONB → copilot_ide_code_completions total_code_lines.",
    source: "raw_copilot_usage (JSONB)",
  },
  {
    name: "Agent Contribution %",
    page: "Code Generation",
    chart: "KPI Card",
    description: "Percentage of total code changes that were agent-initiated (added + deleted).",
    calculation: "ROUND((agent_total / (user_total + agent_total)) × 100, 1). Returns 0 if no activity.",
    source: "raw_copilot_usage (JSONB)",
  },
  {
    name: "Avg Lines Deleted by Agent",
    page: "Code Generation",
    chart: "KPI Card",
    description: "Average daily lines deleted by agent across active days.",
    calculation: "SUM(agent_deleted) / COUNT(DISTINCT active days with agent deletions).",
    source: "raw_copilot_usage (JSONB)",
  },

  // ── Code Generation Charts ──
  {
    name: "Daily Code Changes",
    page: "Code Generation",
    chart: "Stacked Bar Chart",
    description: "Daily total lines of code added vs deleted across all Copilot modes.",
    calculation: "SUM of code_lines added and deleted per day from raw_copilot_usage JSONB breakdown.",
    source: "raw_copilot_usage (JSONB)",
  },
  {
    name: "User-Initiated by Feature",
    page: "Code Generation",
    chart: "Grouped Bar Chart",
    description: "Lines suggested and added by users, broken down by Copilot feature (code_completion, inline_chat, etc.).",
    calculation: "SUM of user-initiated suggested and added LOC per feature from raw_copilot_usage JSONB.",
    source: "raw_copilot_usage (JSONB) → copilot_ide_code_completions by feature",
  },
  {
    name: "Agent-Initiated by Feature",
    page: "Code Generation",
    chart: "Grouped Bar Chart",
    description: "Lines added and deleted by agent mode, broken down by Copilot feature.",
    calculation: "SUM of agent-initiated added and deleted LOC per feature from raw_copilot_usage JSONB.",
    source: "raw_copilot_usage (JSONB) → copilot_ide_code_completions by feature",
  },
  {
    name: "User-Initiated by Model",
    page: "Code Generation",
    chart: "Grouped Bar Chart",
    description: "Lines suggested and added by users, broken down by AI model.",
    calculation: "SUM of user-initiated suggested and added LOC per model from raw_copilot_usage JSONB.",
    source: "raw_copilot_usage (JSONB) → copilot_ide_code_completions by model",
  },
  {
    name: "Agent-Initiated by Model",
    page: "Code Generation",
    chart: "Grouped Bar Chart",
    description: "Lines added and deleted by agent mode, broken down by AI model.",
    calculation: "SUM of agent-initiated added and deleted LOC per model from raw_copilot_usage JSONB.",
    source: "raw_copilot_usage (JSONB) → copilot_ide_code_completions by model",
  },
  {
    name: "User-Initiated by Language",
    page: "Code Generation",
    chart: "Grouped Bar Chart",
    description: "Lines suggested and added by users, broken down by programming language.",
    calculation: "SUM of user-initiated suggested and added LOC per language from raw_copilot_usage JSONB.",
    source: "raw_copilot_usage (JSONB) → copilot_ide_code_completions by language",
  },
  {
    name: "Agent-Initiated by Language",
    page: "Code Generation",
    chart: "Grouped Bar Chart",
    description: "Lines added and deleted by agent mode, broken down by programming language.",
    calculation: "SUM of agent-initiated added and deleted LOC per language from raw_copilot_usage JSONB.",
    source: "raw_copilot_usage (JSONB) → copilot_ide_code_completions by language",
  },

  // ── PR & Autofix KPIs ──
  {
    name: "Pull Requests Created",
    page: "PR & Autofix",
    chart: "KPI Card",
    description: "Total number of pull requests created across all organizations during the selected period.",
    calculation: "SUM(pr_total_created) from fact_org_aggregate_daily within date range.",
    source: "fact_org_aggregate_daily",
  },
  {
    name: "Pull Requests Merged",
    page: "PR & Autofix",
    chart: "KPI Card",
    description: "Total number of pull requests that were merged.",
    calculation: "SUM(pr_total_merged) from fact_org_aggregate_daily within date range.",
    source: "fact_org_aggregate_daily",
  },
  {
    name: "Copilot-Created PRs",
    page: "PR & Autofix",
    chart: "KPI Card",
    description: "Number of pull requests created by Copilot, with percentage of all PRs.",
    calculation: "SUM(pr_total_created_by_copilot). Subtitle: ROUND((copilot_created / total_created) × 100)%.",
    source: "fact_org_aggregate_daily",
  },
  {
    name: "Copilot-Created Merged",
    page: "PR & Autofix",
    chart: "KPI Card",
    description: "Number of Copilot-created PRs that were merged, with percentage of all merged.",
    calculation: "SUM(pr_total_merged_created_by_copilot). Subtitle: ROUND((copilot_merged / total_merged) × 100)%.",
    source: "fact_org_aggregate_daily",
  },
  {
    name: "Avg Time to Merge",
    page: "PR & Autofix",
    chart: "KPI Card",
    description: "Average median minutes to merge across all PRs.",
    calculation: "AVG(pr_median_minutes_to_merge) converted to human-readable format (e.g. '2h 15m').",
    source: "fact_org_aggregate_daily",
  },
  {
    name: "Avg TTM (Copilot)",
    page: "PR & Autofix",
    chart: "KPI Card",
    description: "Average median minutes to merge for Copilot-authored PRs, with speed comparison.",
    calculation: "AVG(pr_median_minutes_to_merge_copilot_authored). Subtitle: '% faster' compared to overall TTM.",
    source: "fact_org_aggregate_daily",
  },
  {
    name: "Review Suggestions",
    page: "PR & Autofix",
    chart: "KPI Card",
    description: "Total Copilot code review suggestions generated.",
    calculation: "SUM(pr_total_suggestions). Subtitle: count applied.",
    source: "fact_org_aggregate_daily",
  },
  {
    name: "PRs Reviewed",
    page: "PR & Autofix",
    chart: "KPI Card",
    description: "Total PRs reviewed overall and by Copilot.",
    calculation: "SUM(pr_total_reviewed). Subtitle: count reviewed by Copilot.",
    source: "fact_org_aggregate_daily",
  },

  // ── PR & Autofix Charts ──
  {
    name: "PR Activity Over Time",
    page: "PR & Autofix",
    chart: "Bar Chart",
    description: "Daily comparison of pull requests created vs merged.",
    calculation: "SUM(pr_total_created) and SUM(pr_total_merged) per day.",
    source: "fact_org_aggregate_daily",
  },
  {
    name: "Copilot Impact on PRs",
    page: "PR & Autofix",
    chart: "Line Chart",
    description: "Daily comparison of all PRs created vs Copilot-created PRs.",
    calculation: "SUM(pr_total_created) and SUM(pr_total_created_by_copilot) per day.",
    source: "fact_org_aggregate_daily",
  },
  {
    name: "Time to Merge (Minutes)",
    page: "PR & Autofix",
    chart: "Line Chart",
    description: "Daily median time to merge for all PRs vs Copilot-authored PRs.",
    calculation: "AVG(pr_median_minutes_to_merge) and AVG(pr_median_minutes_to_merge_copilot_authored) per day.",
    source: "fact_org_aggregate_daily",
  },
  {
    name: "Copilot vs Standard PRs",
    page: "PR & Autofix",
    chart: "Doughnut Chart",
    description: "Proportion of PRs created by Copilot vs standard PRs.",
    calculation: "Copilot-Created: SUM(pr_total_created_by_copilot). Standard: total_created − copilot_created.",
    source: "fact_org_aggregate_daily",
  },
  {
    name: "PR & Autofix by Organization",
    page: "PR & Autofix",
    chart: "Sortable Table",
    description: "Per-organization breakdown of PR metrics and Copilot code review data. Only shown when multiple orgs exist.",
    calculation: "Grouped by org: SUM of created, merged, copilot-created, copilot %, copilot-reviewed, suggestions, apply rate.",
    source: "fact_org_aggregate_daily → dim_org",
  },

  // ── Copilot Code Review & Autofix KPIs ──
  {
    name: "Reviewed by Copilot",
    page: "PR & Autofix",
    chart: "KPI Card",
    description: "Total pull requests reviewed by Copilot code review, with percentage of all reviewed PRs.",
    calculation: "SUM(pr_total_reviewed_by_copilot). Subtitle: ROUND((reviewed_by_copilot / total_reviewed) × 100)%.",
    source: "fact_org_aggregate_daily",
  },
  {
    name: "Copilot Suggestions",
    page: "PR & Autofix",
    chart: "KPI Card",
    description: "Total code review suggestions generated by Copilot, with count of applied suggestions.",
    calculation: "SUM(pr_total_copilot_suggestions). Subtitle: SUM(pr_total_copilot_applied_suggestions) applied.",
    source: "fact_org_aggregate_daily",
  },
  {
    name: "Suggestion Apply Rate",
    page: "PR & Autofix",
    chart: "KPI Card",
    description: "Percentage of Copilot code review suggestions that were accepted and applied.",
    calculation: "ROUND((SUM(pr_total_copilot_applied_suggestions) / SUM(pr_total_copilot_suggestions)) × 100, 1)%.",
    source: "fact_org_aggregate_daily",
  },
  {
    name: "Copilot-Reviewed Merged",
    page: "PR & Autofix",
    chart: "KPI Card",
    description: "Number of pull requests that were reviewed by Copilot and subsequently merged.",
    calculation: "SUM(pr_total_merged_reviewed_by_copilot) from fact_org_aggregate_daily.",
    source: "fact_org_aggregate_daily",
  },

  // ── Copilot Code Review & Autofix Charts ──
  {
    name: "Copilot Review Activity",
    page: "PR & Autofix",
    chart: "Line Chart",
    description: "Daily comparison of PRs reviewed by Copilot vs total PRs reviewed.",
    calculation: "SUM(pr_total_reviewed_by_copilot) and SUM(pr_total_reviewed) per day, area fill.",
    source: "fact_org_aggregate_daily",
  },
  {
    name: "Copilot Suggestions Over Time",
    page: "PR & Autofix",
    chart: "Bar Chart",
    description: "Daily stacked bar of Copilot code review suggestions made vs applied.",
    calculation: "SUM(pr_total_copilot_suggestions) and SUM(pr_total_copilot_applied_suggestions) per day, stacked.",
    source: "fact_org_aggregate_daily",
  },
  {
    name: "Suggestion Outcome",
    page: "PR & Autofix",
    chart: "Doughnut Chart",
    description: "Proportion of Copilot code review suggestions that were applied vs not applied.",
    calculation: "Applied: SUM(pr_total_copilot_applied_suggestions). Not Applied: total_suggestions − applied.",
    source: "fact_org_aggregate_daily",
  },

  // ── Copilot Licensing KPIs ──
  {
    name: "Total Seats",
    page: "Copilot Licensing",
    chart: "KPI Card",
    description: "Total number of Copilot license seats assigned across the enterprise.",
    calculation: "total_seats from the GitHub Copilot Billing Seats API response.",
    source: "GitHub API: /enterprises/{slug}/copilot/billing/seats (live)",
  },
  {
    name: "Active Users",
    page: "Copilot Licensing",
    chart: "KPI Card",
    description: "Number of users who have used Copilot within the inactive threshold (30 days).",
    calculation: "COUNT of seats WHERE last_activity_at IS NOT NULL AND last_activity_at > (now − 30 days).",
    source: "GitHub API: /enterprises/{slug}/copilot/billing/seats (live)",
  },
  {
    name: "Inactive Users",
    page: "Copilot Licensing",
    chart: "KPI Card",
    description: "Number of users with a license who have been inactive beyond the threshold.",
    calculation: "COUNT of seats WHERE last_activity_at IS NOT NULL AND last_activity_at ≤ (now − 30 days).",
    source: "GitHub API: /enterprises/{slug}/copilot/billing/seats (live)",
  },
  {
    name: "Monthly Cost",
    page: "Copilot Licensing",
    chart: "KPI Card",
    description: "Total monthly licensing cost based on seat count and plan pricing ($19/business, $39/enterprise).",
    calculation: "SUM(seats × plan_price). Business = $19/seat, Enterprise = $39/seat.",
    source: "Calculated from seat data + plan pricing",
  },
  {
    name: "Cost Per Active User",
    page: "Copilot Licensing",
    chart: "KPI Card",
    description: "Monthly cost divided by number of active users, showing cost efficiency.",
    calculation: "total_monthly_cost / active_user_count.",
    source: "Derived from seat utilization data",
  },
  {
    name: "Utilization Rate",
    page: "Copilot Licensing",
    chart: "KPI Card",
    description: "Percentage of total seat holders who are active. Green if ≥70%, amber otherwise.",
    calculation: "ROUND((active_count / total_seats) × 100).",
    source: "Derived from seat utilization data",
  },

  // ── Copilot Licensing Charts ──
  {
    name: "Seat Utilization",
    page: "Copilot Licensing",
    chart: "Doughnut Chart",
    description: "Distribution of seats by activity status: Active, Inactive, Never Active.",
    calculation: "Three segments: active_count, inactive_count, never_active_count from seat analysis.",
    source: "GitHub API: /enterprises/{slug}/copilot/billing/seats (live)",
  },
  {
    name: "Seats by Plan Type",
    page: "Copilot Licensing",
    chart: "Doughnut Chart",
    description: "Distribution of seats across license plans (Business vs Enterprise).",
    calculation: "COUNT of seats grouped by plan_type (deduplicated by user, highest plan wins).",
    source: "GitHub API: /enterprises/{slug}/copilot/billing/seats (live)",
  },
  {
    name: "Monthly Cost by Plan",
    page: "Copilot Licensing",
    chart: "Bar Chart",
    description: "Monthly licensing cost broken down by plan type.",
    calculation: "Per plan: seat_count × plan_price ($19 for business, $39 for enterprise).",
    source: "Calculated from seat data + plan pricing",
  },
  {
    name: "Cost vs Savings",
    page: "Copilot Licensing",
    chart: "Bar Chart",
    description: "Comparison of active seat cost vs potential savings from reallocating inactive seats.",
    calculation: "Active Seat Cost = active_count × avg_plan_price. Potential Savings = inactive_count × avg_plan_price.",
    source: "Derived from seat utilization data",
  },
  {
    name: "Inactive Users Table",
    page: "Copilot Licensing",
    chart: "Sortable Table",
    description: "List of users who have been inactive beyond the threshold with cost impact.",
    calculation: "Users WHERE last_activity_at ≤ (now − 30 days). Columns: User, Plan, Assignments, Days Inactive, Last Activity, Editor, Monthly Cost.",
    source: "GitHub API: /enterprises/{slug}/copilot/billing/seats (live)",
  },
  {
    name: "Licensed Users Table",
    page: "Copilot Licensing",
    chart: "Sortable Table",
    description: "Complete list of all licensed users with plan details and status.",
    calculation: "All seats deduplicated by user. Columns: User, Plan, Status, Organization(s), Assigned Via, Assignments, Last Activity, Monthly Cost.",
    source: "GitHub API: /enterprises/{slug}/copilot/billing/seats (live)",
  },

  // ── Premium Requests KPIs ──
  {
    name: "Total Premium Requests",
    page: "Premium Requests",
    chart: "KPI Card",
    description: "Total premium model requests consumed in the selected billing month.",
    calculation: "SUM(gross_quantity) from the GitHub Copilot Premium Requests API for the selected year/month.",
    source: "GitHub API: /enterprises/{slug}/copilot/billing/premium_requests (live)",
  },
  {
    name: "Included Quota",
    page: "Premium Requests",
    chart: "KPI Card",
    description: "Total premium request quota included with license seats (300/business, 1000/enterprise per seat).",
    calculation: "SUM(seat_count × quota_per_seat). Business = 300/seat, Enterprise = 1000/seat.",
    source: "Calculated from seat counts + plan quotas",
  },
  {
    name: "Included Used",
    page: "Premium Requests",
    chart: "KPI Card",
    description: "Number of premium requests covered by the included quota.",
    calculation: "MIN(total_premium_requests, included_quota).",
    source: "Derived from quota vs usage",
  },
  {
    name: "Overage Requests",
    page: "Premium Requests",
    chart: "KPI Card",
    description: "Number of premium requests exceeding the included quota. Red if > 0.",
    calculation: "MAX(0, total_premium_requests − included_quota).",
    source: "Derived from quota vs usage",
  },
  {
    name: "Premium Utilization",
    page: "Premium Requests",
    chart: "KPI Card",
    description: "Percentage of included quota used. Red if >100%, amber if >80%, green otherwise.",
    calculation: "ROUND((total_premium_requests / included_quota) × 100).",
    source: "Derived from quota vs usage",
  },
  {
    name: "Overage Cost",
    page: "Premium Requests",
    chart: "KPI Card",
    description: "Net billing amount for overage premium requests. Red if > $0.",
    calculation: "net_amount from the premium requests API response.",
    source: "GitHub API: /enterprises/{slug}/copilot/billing/premium_requests (live)",
  },

  // ── Premium Requests Charts ──
  {
    name: "Included vs Overage (Donut)",
    page: "Premium Requests",
    chart: "Doughnut Chart",
    description: "Visual breakdown of quota usage: Included (Used), Included (Remaining), Overage (Paid).",
    calculation: "Three segments: included_used, (included_quota − included_used), overage.",
    source: "Derived from quota analysis",
  },
  {
    name: "Premium Requests by Model",
    page: "Premium Requests",
    chart: "Bar Chart",
    description: "Top 15 premium models by request volume.",
    calculation: "gross_quantity per SKU/model from per_model_breakdown, sorted desc, limited to top 15.",
    source: "GitHub API: /enterprises/{slug}/copilot/billing/premium_requests (live)",
  },
  {
    name: "Premium Requests by Organization",
    page: "Premium Requests",
    chart: "Bar Chart",
    description: "Premium request volume per organization.",
    calculation: "gross_quantity per org from per_org_breakdown, sorted alphabetically.",
    source: "GitHub API: /enterprises/{slug}/copilot/billing/premium_requests (live)",
  },
  {
    name: "Model Breakdown Table",
    page: "Premium Requests",
    chart: "Table",
    description: "Detailed per-model breakdown of premium request costs.",
    calculation: "Columns: Model (SKU), Requests, Gross Amount, Net Amount.",
    source: "GitHub API: /enterprises/{slug}/copilot/billing/premium_requests (live)",
  },
  {
    name: "User Breakdown Table",
    page: "Premium Requests",
    chart: "Sortable Table",
    description: "Per-user premium request consumption with cost details.",
    calculation: "Columns: User, Requests, Gross Amount, Net Amount. Display names resolved from dim_user.",
    source: "GitHub API: /enterprises/{slug}/copilot/billing/premium_requests (live)",
  },

  // ── Users Page ──
  {
    name: "Users Directory",
    page: "Users",
    chart: "Sortable Table",
    description: "Comprehensive user directory merging synced usage data with live license assignments.",
    calculation: "LEFT JOIN of usage data (fact_copilot_usage_daily aggregated per user) with live seat data from GitHub API. Columns: User, License, Status, Days Active, Interactions, Accept %, Agent, Chat, CLI, Last Active, Cost/mo.",
    source: "fact_copilot_usage_daily + GitHub Seats API (live)",
    notes: "Supports advanced filtering by: license status, plan, activity status, mode usage (Agent/Chat/CLI), days active range, interaction range, and acceptance rate range.",
  },
];

const PAGES = Array.from(new Set(METRICS.map((m) => m.page)));

/* ── Data Model Reference ── */

const DATA_MODEL = [
  // ── Dimension Tables ──
  {
    table: "dim_date",
    description: "Calendar dimension for date-based analysis. Pre-populated with date attributes for grouping and filtering.",
    columns: [
      "date_key — primary key (DATE)",
      "year, quarter, month, week_of_year",
      "day_of_week, day_of_month",
      "is_weekend — boolean flag",
      "month_name, day_name — human-readable labels",
    ],
  },
  {
    table: "dim_enterprise",
    description: "Enterprise / top-level tenant dimension.",
    columns: [
      "enterprise_id — primary key",
      "enterprise_slug — GitHub enterprise slug",
    ],
  },
  {
    table: "dim_org",
    description: "Organization dimension within an enterprise.",
    columns: [
      "org_id — serial primary key",
      "org_name — unique organization name",
      "github_org_id — GitHub numeric org ID",
      "enterprise_id — FK to dim_enterprise",
    ],
  },
  {
    table: "dim_user",
    description: "SCD Type 2 user dimension. Tracks user attributes over time with effective date ranges.",
    columns: [
      "user_key — surrogate primary key",
      "user_id — GitHub numeric user ID",
      "user_login — GitHub username",
      "org_id — FK to dim_org",
      "team_name — team assignment",
      "effective_from, effective_to — SCD2 validity window",
      "is_current — boolean, true for the latest version",
      "license_assigned_date",
    ],
  },
  {
    table: "dim_ide",
    description: "IDE / editor dimension (e.g. VS Code, JetBrains, Neovim).",
    columns: [
      "ide_id — serial primary key",
      "ide_name — unique IDE name",
    ],
  },
  {
    table: "dim_feature",
    description: "Feature / chat mode dimension (e.g. chat_panel_agent_mode, code_completion, inline_chat).",
    columns: [
      "feature_id — serial primary key",
      "feature_name — unique feature identifier",
      "feature_category — optional grouping label",
    ],
  },
  {
    table: "dim_model",
    description: "AI model dimension (e.g. gpt-5.2-codex, claude-4.0-sonnet).",
    columns: [
      "model_id — serial primary key",
      "model_name — unique model name",
    ],
  },
  {
    table: "dim_language",
    description: "Programming language dimension (e.g. TypeScript, Python).",
    columns: [
      "language_id — serial primary key",
      "language_name — unique language name",
    ],
  },

  // ── Fact Tables ──
  {
    table: "fact_copilot_usage_daily",
    description: "Core fact table. One row per user per day. Aggregated from the GitHub Copilot Usage Metrics API (v2026-03-10).",
    columns: [
      "user_id, user_login, day",
      "user_initiated_interaction_count — total chat/agent requests",
      "code_generation_activity_count — inline code suggestions shown",
      "code_acceptance_activity_count — inline suggestions accepted",
      "loc_added_sum — lines of code added",
      "used_agent, used_copilot_coding_agent, used_chat, used_cli — boolean flags for mode usage",
    ],
  },
  {
    table: "fact_user_feature_daily",
    description: "One row per user per feature per day. Breaks down activity by Copilot feature (chat mode).",
    columns: [
      "user_id, feature_id (FK → dim_feature), day",
      "user_initiated_interaction_count",
      "code_generation_activity_count, code_acceptance_activity_count",
    ],
  },
  {
    table: "fact_user_model_daily",
    description: "One row per user per model per feature per day. Tracks which AI models users interact with.",
    columns: [
      "user_id, model_id (FK → dim_model), feature_id (FK → dim_feature), day",
      "user_initiated_interaction_count",
      "code_generation_activity_count, code_acceptance_activity_count",
    ],
  },
  {
    table: "fact_user_ide_daily",
    description: "One row per user per IDE per day. Tracks which editors users are using with Copilot.",
    columns: [
      "user_id, ide_id (FK → dim_ide), day",
      "user_initiated_interaction_count",
      "code_generation_activity_count, code_acceptance_activity_count",
    ],
  },
  {
    table: "fact_user_language_daily",
    description: "One row per user per language per day. Tracks programming language usage in code generation.",
    columns: [
      "user_id, language_id (FK → dim_language), day",
      "code_generation_activity_count, code_acceptance_activity_count",
    ],
  },
  {
    table: "fact_user_language_model_daily",
    description: "One row per user per language per model per day. Cross-reference of language and model usage.",
    columns: [
      "user_id, language_id (FK → dim_language), model_id (FK → dim_model), day",
      "code_generation_activity_count, code_acceptance_activity_count",
    ],
  },
  {
    table: "fact_cli_daily",
    description: "One row per user per CLI version per day. Stores session, request, and token metrics from the totals_by_cli API field.",
    columns: [
      "user_id, day, cli_version",
      "session_count — number of CLI sessions",
      "request_count — number of CLI requests",
      "prompt_count — number of prompts sent",
      "prompt_tokens — total prompt tokens consumed",
      "completion_tokens — total output/completion tokens",
      "total_tokens — prompt_tokens + completion_tokens",
    ],
  },
  {
    table: "fact_org_aggregate_daily",
    description: "One row per org per day. Stores organization-level aggregate metrics including pull request data from the copilot_metrics_api org endpoint.",
    columns: [
      "org_id (FK → dim_org), day, scope",
      "daily_active_users, weekly_active_users, monthly_active_users",
      "monthly_active_agent_users, monthly_active_chat_users, daily_active_cli_users",
      "pr_total_created, pr_total_reviewed, pr_total_merged",
      "pr_median_minutes_to_merge — median TTM for all PRs",
      "pr_total_suggestions, pr_total_applied_suggestions",
      "pr_total_created_by_copilot, pr_total_reviewed_by_copilot",
      "pr_total_merged_created_by_copilot, pr_total_merged_reviewed_by_copilot",
      "pr_median_minutes_to_merge_copilot_authored",
      "pr_total_copilot_suggestions, pr_total_copilot_applied_suggestions",
    ],
  },

  // ── Raw Data ──
  {
    table: "raw_copilot_usage",
    description: "Raw API response stored as JSONB. Contains detailed code generation breakdowns by feature, model, and language used exclusively by the Code Generation report.",
    columns: [
      "user_id, day",
      "data — JSONB column containing the full GitHub Copilot Usage Metrics API response",
      "Used to extract copilot_ide_code_completions with user-initiated vs agent-initiated LOC breakdowns",
    ],
  },

  // ── System Tables ──
  {
    table: "ingestion_log",
    description: "Tracks every data sync operation — API pulls and file uploads — with timing, row counts, and status.",
    columns: [
      "id — bigserial primary key",
      "ingestion_date, source (api/upload), scope, scope_detail, org_name",
      "started_at, completed_at, status (running/completed/failed)",
      "records_fetched, records_inserted, records_skipped, aggregate_records",
      "api_requests — count of GitHub API calls made",
      "error_message, log_messages — detailed run log",
    ],
  },
  {
    table: "app_settings",
    description: "Key-value store for application configuration (GitHub token, enterprise slug, sync schedule, etc.).",
    columns: [
      "key — varchar primary key (e.g. github_token, enterprise_slug, sync_interval)",
      "value — text value",
    ],
  },
  {
    table: "audit_log",
    description: "Tracks administrative actions performed in the application (settings changes, resets, syncs).",
    columns: [
      "id — bigserial primary key",
      "action — e.g. settings_update, data_reset, ingest_start",
      "category — e.g. settings, data, auth, system",
      "actor — user or 'system'",
      "details — JSONB with action-specific data",
      "ip_address, created_at",
    ],
  },
];

/* ── Component ── */

export default function MetricsInfoPage() {
  const [pageFilter, setPageFilter] = useState<string>("All");
  const [search, setSearch] = useState("");

  const filtered = METRICS.filter((m) => {
    if (pageFilter !== "All" && m.page !== pageFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.calculation.toLowerCase().includes(q) ||
        m.source.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">GitHub Copilot Metrics Reference</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Complete list of all metrics, how they are calculated, and their data sources
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={pageFilter}
          onChange={(e) => setPageFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-xs focus:border-blue-500 focus:outline-hidden dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        >
          <option value="All">All pages</option>
          {PAGES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search metrics..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-xs placeholder:text-gray-400 focus:border-blue-500 focus:outline-hidden dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500"
        />
        <span className="text-xs text-gray-400 dark:text-gray-500">{filtered.length} metrics</span>
      </div>

      {/* Metrics List */}
      <div className="space-y-4">
        {filtered.map((m, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white shadow-xs dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-700">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{m.name}</h3>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  {m.page}
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  {m.chart}
                </span>
              </div>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Description</p>
                <p className="mt-0.5 text-gray-700 dark:text-gray-300">{m.description}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Calculation</p>
                <p className="mt-0.5 font-mono text-xs text-gray-600 bg-gray-50 rounded-sm px-2 py-1.5 dark:bg-gray-900 dark:text-gray-400">
                  {m.calculation}
                </p>
              </div>
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Data Source</p>
                  <p className="mt-0.5 font-mono text-xs text-gray-600 dark:text-gray-400">{m.source}</p>
                </div>
                {m.notes && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Notes</p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{m.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Data Model Reference */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Data Model</h2>
        <p className="text-sm text-gray-500 mb-4 dark:text-gray-400">
          Star schema ingested from the GitHub Copilot Usage Metrics API (version 2026-03-10)
        </p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {DATA_MODEL.map((t) => (
            <div key={t.table} className="rounded-lg border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">{t.table}</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t.description}</p>
              <ul className="mt-2 space-y-0.5">
                {t.columns.map((c, i) => (
                  <li key={i} className="font-mono text-[11px] text-gray-600 dark:text-gray-400">
                    <span className="text-gray-400 dark:text-gray-500">•</span> {c}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* API Reference */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">API Endpoints</h2>
        <p className="text-sm text-gray-500 mb-4 dark:text-gray-400">Internal REST APIs that power the dashboard</p>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-xs dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <th className="px-4 py-2">Endpoint</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2">Parameters</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 dark:text-gray-300">
              {[
                { ep: "GET /api/metrics/dashboard", desc: "All Copilot Usage dashboard metrics (12 parallel queries)", params: "days, start, end, userId, orgId" },
                { ep: "GET /api/metrics/agents", desc: "Agent impact metrics (8 parallel queries)", params: "days, start, end, userId, orgId" },
                { ep: "GET /api/metrics/cli", desc: "CLI impact metrics (11 parallel queries)", params: "days, start, end, userId, orgId" },
                { ep: "GET /api/metrics/code-generation", desc: "Code generation LOC breakdown from raw JSONB", params: "days, start, end, userId, orgId" },
                { ep: "GET /api/metrics/pull-requests", desc: "Pull request metrics from org aggregate data", params: "days, start, end, orgId" },
                { ep: "GET /api/metrics/seats", desc: "Live seat assignments from GitHub Billing API", params: "—" },
                { ep: "GET /api/metrics/premium-requests", desc: "Live premium request billing from GitHub API", params: "year, month" },
                { ep: "GET /api/filters", desc: "Filter options (users + orgs list)", params: "—" },
                { ep: "GET /api/users", desc: "User list with activity stats + license data", params: "days, start, end, search, orgId, segment, limit, offset, sortBy, sortDir" },
                { ep: "GET /api/data-range", desc: "Synced data date range, row count, and last sync info", params: "—" },
                { ep: "GET /api/settings", desc: "Application settings (token, slug, schedule)", params: "—" },
                { ep: "PUT /api/settings", desc: "Update application settings", params: "JSON body" },
                { ep: "GET /api/settings/sync-history", desc: "Ingestion history log with pagination", params: "limit, offset" },
                { ep: "GET /api/settings/sync-interval", desc: "Current sync interval configuration", params: "—" },
                { ep: "PUT /api/settings/sync-interval", desc: "Update sync interval", params: "JSON body" },
                { ep: "GET /api/settings/sync-schedule", desc: "Current cron schedule configuration", params: "—" },
                { ep: "PUT /api/settings/sync-schedule", desc: "Update sync schedule", params: "JSON body" },
                { ep: "POST /api/ingest", desc: "Trigger one-off ingest from GitHub API (sync)", params: "—" },
                { ep: "POST /api/ingest/stream", desc: "Trigger ingest with SSE progress streaming", params: "—" },
                { ep: "POST /api/ingest/upload", desc: "Upload NDJSON/JSON metrics file with SSE streaming", params: "file (multipart)" },
                { ep: "POST /api/auth/verify-admin", desc: "Verify admin password for settings access", params: "JSON body" },
                { ep: "POST /api/admin/reset", desc: "Reset database (truncate all data tables)", params: "—" },
              ].map((r) => (
                <tr key={r.ep} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{r.ep}</td>
                  <td className="px-4 py-2">{r.desc}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">{r.params}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
