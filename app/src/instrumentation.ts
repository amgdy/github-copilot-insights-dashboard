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
    const db = drizzle({ client: sql });

    try {
      await migrate(db, { migrationsFolder: "./drizzle" });
      console.info("Database migrations completed successfully");
    } catch (err) {
      console.error("Database migration failed:", err);
    }

    // Fixup: ensure columns from migration 0002 exist (may have been
    // recorded as applied before the ALTER TABLE statements succeeded).
    try {
      await sql`ALTER TABLE "dim_model" ADD COLUMN IF NOT EXISTS "is_premium" boolean DEFAULT false NOT NULL`;
      await sql`ALTER TABLE "dim_model" ADD COLUMN IF NOT EXISTS "is_enabled" boolean`;
      await sql`ALTER TABLE "ingestion_log" ADD COLUMN IF NOT EXISTS "source" varchar(20) DEFAULT 'api' NOT NULL`;
      await sql`ALTER TABLE "ingestion_log" ADD COLUMN IF NOT EXISTS "records_skipped" integer DEFAULT 0`;
      await sql`ALTER TABLE "raw_copilot_usage" ADD COLUMN IF NOT EXISTS "content_hash" varchar(64)`;
      console.info("Schema fixup: dim_model, ingestion_log & raw_copilot_usage columns verified");
    } catch (err) {
      console.error("Schema fixup failed:", err);
    } finally {
      await sql.end();
    }

    // Initialize ETL sync scheduler using saved settings
    const { getSetting } = await import("@/lib/db/settings");
    const { startScheduler } = await import("@/lib/etl/scheduler");

    let syncEnabled = true; // default: enabled for backward compat
    try {
      const savedEnabled = await getSetting("sync_enabled");
      if (savedEnabled !== null) {
        syncEnabled = savedEnabled === "true";
      }
    } catch {
      // use default
    }

    let intervalMinutes = 1440; // default 24h
    try {
      const savedMinutes = await getSetting("sync_interval_minutes");
      if (savedMinutes) {
        intervalMinutes = Number(savedMinutes);
      } else {
        // Backward compatibility: migrate from sync_interval_hours
        const savedHours = await getSetting("sync_interval_hours");
        if (savedHours) intervalMinutes = Number(savedHours) * 60;
      }
    } catch {
      // use default
    }

    if (syncEnabled) {
      startScheduler(intervalMinutes);
    } else {
      const label = intervalMinutes < 60
        ? `${intervalMinutes}m`
        : intervalMinutes % 60 === 0
          ? `${intervalMinutes / 60}h`
          : `${Math.floor(intervalMinutes / 60)}h ${intervalMinutes % 60}m`;
      console.info(`Sync scheduler is disabled (interval: ${label}). Enable it from the Data Sync settings page.`);
    }
  }
}
