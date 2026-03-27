export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.warn("DATABASE_URL not set — skipping database migrations");
      return;
    }

    const sql = postgres(connectionString, { max: 1 });
    const db = drizzle(sql);

    try {
      await migrate(db, { migrationsFolder: "./drizzle" });
      console.info("Database migrations completed successfully");
    } catch (err) {
      console.error("Database migration failed:", err);
    }

    // Fixup: ensure columns from migration 0002 exist (may have been
    // recorded as applied before the ALTER TABLE statements succeeded).
    try {
      await sql`ALTER TABLE "dim_model" ADD COLUMN IF NOT EXISTS "display_name" varchar(255)`;
      await sql`ALTER TABLE "dim_model" ADD COLUMN IF NOT EXISTS "is_premium" boolean DEFAULT false NOT NULL`;
      await sql`ALTER TABLE "dim_model" ADD COLUMN IF NOT EXISTS "is_enabled" boolean`;
      await sql`ALTER TABLE "ingestion_log" ADD COLUMN IF NOT EXISTS "source" varchar(20) DEFAULT 'api' NOT NULL`;
      console.info("Schema fixup: dim_model & ingestion_log columns verified");
    } catch (err) {
      console.error("Schema fixup failed:", err);
    } finally {
      await sql.end();
    }

    // Schedule ETL ingestion using configurable interval (default 24h)
    const { getSetting } = await import("@/lib/db/settings");
    let intervalHours = 24;
    try {
      const saved = await getSetting("sync_interval_hours");
      if (saved) intervalHours = Number(saved);
    } catch {
      // use default
    }
    const intervalMs = intervalHours * 60 * 60 * 1000;
    console.info(`Scheduling ETL ingestion every ${intervalHours}h`);
    setInterval(async () => {
      try {
        const { getGitHubConfig } = await import("@/lib/db/settings");
        const { ingestCopilotUsage } = await import("@/lib/etl/ingest");
        const { token, enterpriseSlug } = await getGitHubConfig();
        if (!token || !enterpriseSlug) {
          console.warn("Scheduled ingest skipped — GitHub token or slug not configured");
          return;
        }
        console.info("Scheduled ETL ingestion started");
        const result = await ingestCopilotUsage({ token, enterpriseSlug, source: "scheduled" });
        console.info(
          `Scheduled ETL ingestion complete — fetched: ${result.recordsFetched}, inserted: ${result.recordsInserted}`
        );
      } catch (err) {
        console.error("Scheduled ETL ingestion failed:", err);
      }
    }, intervalMs);
  }
}
