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
