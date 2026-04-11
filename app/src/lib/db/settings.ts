import { db } from "./index";
import { appSettings } from "./schema";
import { eq } from "drizzle-orm";

export async function getSetting(key: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function deleteSetting(key: string): Promise<void> {
  await db.delete(appSettings).where(eq(appSettings.key, key));
}

export async function getGitHubConfig(): Promise<{
  token: string | null;
  enterpriseSlug: string | null;
}> {
  const token = await getSetting("github_token");
  const slug = await getSetting("github_enterprise_slug");
  return { token, enterpriseSlug: slug };
}

export type SyncScope = "enterprise" | "all_orgs" | "organization";

export async function getSyncScopeConfig(): Promise<{
  scopes: SyncScope[];
  orgLogins: string[];
}> {
  const raw = (await getSetting("sync_scope")) ?? "enterprise";
  const orgLoginsRaw = await getSetting("sync_org_logins");
  const orgLogins = orgLoginsRaw
    ? orgLoginsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const validScopes: SyncScope[] = ["enterprise", "all_orgs", "organization"];
  const scopes = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is SyncScope => validScopes.includes(s as SyncScope));
  return {
    scopes: scopes.length > 0 ? scopes : ["enterprise"],
    orgLogins,
  };
}
