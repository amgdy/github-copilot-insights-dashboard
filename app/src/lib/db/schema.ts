import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  date,
  timestamp,
  text,
  numeric,
  jsonb,
  bigserial,
  smallint,
  uuid,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ── Dimension Tables ──

export const dimDate = pgTable("dim_date", {
  dateKey: date("date_key").primaryKey(),
  year: smallint("year").notNull(),
  quarter: smallint("quarter").notNull(),
  month: smallint("month").notNull(),
  weekOfYear: smallint("week_of_year").notNull(),
  dayOfWeek: smallint("day_of_week").notNull(),
  dayOfMonth: smallint("day_of_month").notNull(),
  isWeekend: boolean("is_weekend").notNull(),
  monthName: varchar("month_name", { length: 10 }).notNull(),
  dayName: varchar("day_name", { length: 10 }).notNull(),
});

export const dimEnterprise = pgTable("dim_enterprise", {
  enterpriseId: integer("enterprise_id").primaryKey(),
  enterpriseSlug: varchar("enterprise_slug", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dimOrg = pgTable("dim_org", {
  orgId: serial("org_id").primaryKey(),
  orgName: varchar("org_name", { length: 255 }).notNull().unique(),
  githubOrgId: integer("github_org_id"),
  enterpriseId: integer("enterprise_id").references(() => dimEnterprise.enterpriseId),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dimUser = pgTable(
  "dim_user",
  {
    userKey: serial("user_key").primaryKey(),
    userId: integer("user_id").notNull(),
    userLogin: varchar("user_login", { length: 255 }).notNull(),
    orgId: integer("org_id").references(() => dimOrg.orgId),
    teamName: varchar("team_name", { length: 255 }),
    effectiveFrom: date("effective_from").defaultNow().notNull(),
    effectiveTo: date("effective_to").default("9999-12-31"),
    isCurrent: boolean("is_current").default(true).notNull(),
    licenseAssignedDate: date("license_assigned_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_dim_user_user_id").on(table.userId),
  ]
);

export const dimIde = pgTable("dim_ide", {
  ideId: serial("ide_id").primaryKey(),
  ideName: varchar("ide_name", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dimFeature = pgTable("dim_feature", {
  featureId: serial("feature_id").primaryKey(),
  featureName: varchar("feature_name", { length: 255 }).notNull().unique(),
  featureCategory: varchar("feature_category", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dimLanguage = pgTable("dim_language", {
  languageId: serial("language_id").primaryKey(),
  languageName: varchar("language_name", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dimModel = pgTable("dim_model", {
  modelId: serial("model_id").primaryKey(),
  modelName: varchar("model_name", { length: 255 }).notNull().unique(),
  isPremium: boolean("is_premium").default(false).notNull(),
  isEnabled: boolean("is_enabled"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Fact Tables ──

export const rawCopilotUsage = pgTable(
  "raw_copilot_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
    reportDate: date("report_date").notNull(),
    enterpriseId: integer("enterprise_id").notNull(),
    userId: integer("user_id").notNull(),
    rawJson: jsonb("raw_json").notNull(),
    contentHash: varchar("content_hash", { length: 64 }),
  },
  (table) => [
    uniqueIndex("idx_raw_unique").on(table.reportDate, table.enterpriseId, table.userId),
  ]
);

export const factCopilotUsageDaily = pgTable(
  "fact_copilot_usage_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    enterpriseId: integer("enterprise_id").notNull(),
    userId: integer("user_id").notNull(),
    userLogin: varchar("user_login", { length: 255 }).notNull(),
    orgId: integer("org_id").references(() => dimOrg.orgId),
    userInitiatedInteractionCount: integer("user_initiated_interaction_count").default(0).notNull(),
    codeGenerationActivityCount: integer("code_generation_activity_count").default(0).notNull(),
    codeAcceptanceActivityCount: integer("code_acceptance_activity_count").default(0).notNull(),
    usedAgent: boolean("used_agent").default(false).notNull(),
    usedCopilotCodingAgent: boolean("used_copilot_coding_agent").default(false).notNull(),
    usedChat: boolean("used_chat").default(false).notNull(),
    usedCli: boolean("used_cli").default(false).notNull(),
    locSuggestedToAddSum: integer("loc_suggested_to_add_sum").default(0).notNull(),
    locSuggestedToDeleteSum: integer("loc_suggested_to_delete_sum").default(0).notNull(),
    locAddedSum: integer("loc_added_sum").default(0).notNull(),
    locDeletedSum: integer("loc_deleted_sum").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("idx_fact_usage_unique").on(table.day, table.enterpriseId, table.userId),
    index("idx_fact_usage_day_org").on(table.day, table.orgId),
  ]
);

export const factUserFeatureDaily = pgTable(
  "fact_user_feature_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    userId: integer("user_id").notNull(),
    featureId: integer("feature_id").notNull().references(() => dimFeature.featureId),
    userInitiatedInteractionCount: integer("user_initiated_interaction_count").default(0).notNull(),
    codeGenerationActivityCount: integer("code_generation_activity_count").default(0).notNull(),
    codeAcceptanceActivityCount: integer("code_acceptance_activity_count").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("idx_fact_feature_unique").on(table.day, table.userId, table.featureId),
  ]
);

export const factUserIdeDaily = pgTable(
  "fact_user_ide_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    userId: integer("user_id").notNull(),
    ideId: integer("ide_id").notNull().references(() => dimIde.ideId),
    userInitiatedInteractionCount: integer("user_initiated_interaction_count").default(0).notNull(),
    codeGenerationActivityCount: integer("code_generation_activity_count").default(0).notNull(),
    codeAcceptanceActivityCount: integer("code_acceptance_activity_count").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("idx_fact_ide_unique").on(table.day, table.userId, table.ideId),
  ]
);

export const factUserLanguageDaily = pgTable(
  "fact_user_language_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    userId: integer("user_id").notNull(),
    languageId: integer("language_id").notNull().references(() => dimLanguage.languageId),
    featureId: integer("feature_id").notNull().references(() => dimFeature.featureId),
    userInitiatedInteractionCount: integer("user_initiated_interaction_count").default(0).notNull(),
    codeGenerationActivityCount: integer("code_generation_activity_count").default(0).notNull(),
    codeAcceptanceActivityCount: integer("code_acceptance_activity_count").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("idx_fact_lang_unique").on(table.day, table.userId, table.languageId, table.featureId),
  ]
);

export const factUserModelDaily = pgTable(
  "fact_user_model_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    userId: integer("user_id").notNull(),
    modelId: integer("model_id").notNull().references(() => dimModel.modelId),
    featureId: integer("feature_id").notNull().references(() => dimFeature.featureId),
    userInitiatedInteractionCount: integer("user_initiated_interaction_count").default(0).notNull(),
    codeGenerationActivityCount: integer("code_generation_activity_count").default(0).notNull(),
    codeAcceptanceActivityCount: integer("code_acceptance_activity_count").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("idx_fact_model_unique").on(table.day, table.userId, table.modelId, table.featureId),
  ]
);

export const factUserLanguageModelDaily = pgTable(
  "fact_user_language_model_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    userId: integer("user_id").notNull(),
    languageId: integer("language_id").notNull().references(() => dimLanguage.languageId),
    modelId: integer("model_id").notNull().references(() => dimModel.modelId),
    codeGenerationActivityCount: integer("code_generation_activity_count").default(0).notNull(),
    codeAcceptanceActivityCount: integer("code_acceptance_activity_count").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("idx_fact_lang_model_unique").on(table.day, table.userId, table.languageId, table.modelId),
  ]
);

export const factCliDaily = pgTable(
  "fact_cli_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    userId: integer("user_id").notNull(),
    cliVersion: varchar("cli_version", { length: 50 }),
    sessionCount: integer("session_count").default(0).notNull(),
    requestCount: integer("request_count").default(0).notNull(),
    promptCount: integer("prompt_count").default(0).notNull(),
    promptTokens: integer("prompt_tokens").default(0).notNull(),
    completionTokens: integer("completion_tokens").default(0).notNull(),
    totalTokens: integer("total_tokens").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("idx_fact_cli_unique").on(table.day, table.userId, table.cliVersion),
  ]
);

export const factOrgAggregateDaily = pgTable(
  "fact_org_aggregate_daily",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    day: date("day").notNull(),
    orgId: integer("org_id").references(() => dimOrg.orgId),
    scope: varchar("scope", { length: 20 }).default("organization").notNull(),
    dailyActiveUsers: integer("daily_active_users").default(0),
    weeklyActiveUsers: integer("weekly_active_users").default(0),
    monthlyActiveUsers: integer("monthly_active_users").default(0),
    monthlyActiveAgentUsers: integer("monthly_active_agent_users").default(0),
    monthlyActiveChatUsers: integer("monthly_active_chat_users").default(0),
    dailyActiveCliUsers: integer("daily_active_cli_users").default(0),
    // Pull Request metrics
    prTotalCreated: integer("pr_total_created").default(0),
    prTotalReviewed: integer("pr_total_reviewed").default(0),
    prTotalMerged: integer("pr_total_merged").default(0),
    prMedianMinutesToMerge: numeric("pr_median_minutes_to_merge"),
    prTotalSuggestions: integer("pr_total_suggestions").default(0),
    prTotalAppliedSuggestions: integer("pr_total_applied_suggestions").default(0),
    prTotalCreatedByCopilot: integer("pr_total_created_by_copilot").default(0),
    prTotalReviewedByCopilot: integer("pr_total_reviewed_by_copilot").default(0),
    prTotalMergedCreatedByCopilot: integer("pr_total_merged_created_by_copilot").default(0),
    prTotalMergedReviewedByCopilot: integer("pr_total_merged_reviewed_by_copilot").default(0),
    prMedianMinutesToMergeCopilotAuthored: numeric("pr_median_minutes_to_merge_copilot_authored"),
    prMedianMinutesToMergeCopilotReviewed: numeric("pr_median_minutes_to_merge_copilot_reviewed"),
    prTotalCopilotSuggestions: integer("pr_total_copilot_suggestions").default(0),
    prTotalCopilotAppliedSuggestions: integer("pr_total_copilot_applied_suggestions").default(0),
  },
  (table) => [
    uniqueIndex("idx_fact_org_agg_unique").on(table.day, table.orgId, table.scope),
    index("idx_fact_org_agg_day").on(table.day),
  ]
);

export const ingestionLog = pgTable("ingestion_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ingestionDate: date("ingestion_date").notNull(),
  source: varchar("source", { length: 20 }).default("api").notNull(),
  scope: varchar("scope", { length: 30 }).default("enterprise"),
  scopeDetail: varchar("scope_detail", { length: 500 }),
  orgName: varchar("org_name", { length: 255 }),
  orgsDiscovered: integer("orgs_discovered").default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: varchar("status", { length: 20 }).default("running").notNull(),
  recordsFetched: integer("records_fetched").default(0),
  recordsInserted: integer("records_inserted").default(0),
  recordsSkipped: integer("records_skipped").default(0),
  aggregateRecords: integer("aggregate_records").default(0),
  errorMessage: text("error_message"),
  apiRequests: integer("api_requests").default(0),
  logMessages: text("log_messages"),
});

export const savedViews = pgTable("saved_views", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  filtersJson: jsonb("filters_json").notNull(),
  dashboardPath: varchar("dashboard_path", { length: 255 }).notNull(),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const alertRules = pgTable("alert_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  metricName: varchar("metric_name", { length: 255 }).notNull(),
  condition: varchar("condition", { length: 20 }).notNull(),
  threshold: numeric("threshold").notNull(),
  scopeType: varchar("scope_type", { length: 20 }).default("enterprise").notNull(),
  scopeId: integer("scope_id"),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Audit Log ──

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    action: varchar("action", { length: 100 }).notNull(),
    category: varchar("category", { length: 50 }).notNull(),
    actor: varchar("actor", { length: 255 }).default("system").notNull(),
    details: jsonb("details"),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_audit_log_category").on(table.category),
    index("idx_audit_log_created_at").on(table.createdAt),
  ]
);
