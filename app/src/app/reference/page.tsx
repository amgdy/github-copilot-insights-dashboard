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
];

const PAGES = Array.from(new Set(METRICS.map((m) => m.page)));

/* ── Data Model Reference ── */

const DATA_MODEL = [
  {
    table: "fact_copilot_usage_daily",
    description: "One row per user per day. Core fact table from the GitHub Copilot Usage Metrics API (version 2026-03-10).",
    columns: [
      "user_id, user_login, day",
      "user_initiated_interaction_count — total chat/agent requests",
      "code_generation_activity_count — inline code suggestions shown",
      "code_acceptance_activity_count — inline suggestions accepted",
      "loc_added_sum — lines of code added",
      "used_agent, used_chat, used_cli — boolean flags for mode usage",
    ],
  },
  {
    table: "fact_user_feature_daily",
    description: "One row per user per feature per day. Breaks down activity by Copilot feature (chat mode).",
    columns: [
      "user_id, feature_id, day",
      "user_initiated_interaction_count",
      "code_generation_activity_count, code_acceptance_activity_count",
    ],
  },
  {
    table: "fact_user_model_daily",
    description: "One row per user per model per feature per day. Tracks which AI models users interact with.",
    columns: [
      "user_id, model_id, feature_id, day",
      "user_initiated_interaction_count",
      "code_generation_activity_count, code_acceptance_activity_count",
    ],
  },
  {
    table: "fact_user_language_daily",
    description: "One row per user per language per day. Tracks programming language usage in code generation.",
    columns: [
      "user_id, language_id, day",
      "code_generation_activity_count, code_acceptance_activity_count",
    ],
  },
  {
    table: "fact_user_language_model_daily",
    description: "One row per user per language per model per day. Cross-reference of language and model usage.",
    columns: [
      "user_id, language_id, model_id, day",
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
    table: "dim_user",
    description: "SCD Type 2 user dimension. Tracks user attributes over time.",
    columns: ["user_id, login, display_name, team_name, org_id, is_current"],
  },
  {
    table: "dim_feature",
    description: "Feature/chat mode dimension.",
    columns: ["feature_id, feature_name (e.g. chat_panel_agent_mode, code_completion)"],
  },
  {
    table: "dim_model",
    description: "AI model dimension.",
    columns: ["model_id, model_name (e.g. gpt-5.2-codex, claude-4.0-sonnet)"],
  },
  {
    table: "dim_language",
    description: "Programming language dimension.",
    columns: ["language_id, language_name (e.g. TypeScript, Python)"],
  },
  {
    table: "raw_copilot_usage",
    description: "Raw API response stored as JSONB. Contains detailed code generation breakdowns by feature, model, and language used by the Code Generation report.",
    columns: [
      "user_id, day",
      "data — JSONB column containing the full GitHub Copilot Usage Metrics API response",
      "Used to extract copilot_ide_code_completions with user-initiated vs agent-initiated LOC breakdowns",
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
        <h1 className="text-xl font-bold text-gray-900">GitHub Copilot Metrics Reference</h1>
        <p className="text-sm text-gray-500">
          Complete list of all metrics, how they are calculated, and their data sources
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={pageFilter}
          onChange={(e) => setPageFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-xs focus:border-blue-500 focus:outline-hidden"
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
          className="w-64 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-xs placeholder:text-gray-400 focus:border-blue-500 focus:outline-hidden"
        />
        <span className="text-xs text-gray-400">{filtered.length} metrics</span>
      </div>

      {/* Metrics List */}
      <div className="space-y-4">
        {filtered.map((m, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white shadow-xs">
            <div className="border-b border-gray-100 px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">{m.name}</h3>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                  {m.page}
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                  {m.chart}
                </span>
              </div>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Description</p>
                <p className="mt-0.5 text-gray-700">{m.description}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Calculation</p>
                <p className="mt-0.5 font-mono text-xs text-gray-600 bg-gray-50 rounded-sm px-2 py-1.5">
                  {m.calculation}
                </p>
              </div>
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Data Source</p>
                  <p className="mt-0.5 font-mono text-xs text-gray-600">{m.source}</p>
                </div>
                {m.notes && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Notes</p>
                    <p className="mt-0.5 text-xs text-gray-500">{m.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Data Model Reference */}
      <div>
        <h2 className="text-lg font-bold text-gray-900">Data Model</h2>
        <p className="text-sm text-gray-500 mb-4">
          Star schema ingested from the GitHub Copilot Usage Metrics API (version 2026-03-10)
        </p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {DATA_MODEL.map((t) => (
            <div key={t.table} className="rounded-lg border border-gray-200 bg-white p-4 shadow-xs">
              <h3 className="font-mono text-sm font-semibold text-gray-900">{t.table}</h3>
              <p className="mt-1 text-xs text-gray-500">{t.description}</p>
              <ul className="mt-2 space-y-0.5">
                {t.columns.map((c, i) => (
                  <li key={i} className="font-mono text-[11px] text-gray-600">
                    <span className="text-gray-400">•</span> {c}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* API Reference */}
      <div>
        <h2 className="text-lg font-bold text-gray-900">API Endpoints</h2>
        <p className="text-sm text-gray-500 mb-4">Internal REST APIs that power the dashboard</p>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-xs">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-4 py-2">Endpoint</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2">Parameters</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {[
                { ep: "GET /api/metrics/dashboard", desc: "All dashboard metrics (12 parallel queries)", params: "days, start, end, userId" },
                { ep: "GET /api/metrics/agents", desc: "Agent impact metrics (8 parallel queries)", params: "days, start, end, userId" },
                { ep: "GET /api/metrics/cli", desc: "CLI impact metrics (11 parallel queries)", params: "days, start, end, userId" },
                { ep: "GET /api/filters", desc: "Filter options (users list)", params: "—" },
                { ep: "GET /api/users", desc: "User list with activity stats", params: "limit, offset" },
                { ep: "POST /api/ingest", desc: "Trigger API pull ingest from GitHub", params: "—" },
                { ep: "POST /api/ingest/upload", desc: "Upload JSON metrics file", params: "file (multipart)" },
                { ep: "POST /api/admin/reset", desc: "Reset database (truncate all tables)", params: "—" },
              ].map((r) => (
                <tr key={r.ep} className="border-b border-gray-100">
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{r.ep}</td>
                  <td className="px-4 py-2">{r.desc}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{r.params}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
