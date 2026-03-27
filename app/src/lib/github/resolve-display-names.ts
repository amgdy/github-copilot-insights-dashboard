const GITHUB_API_BASE = "https://api.github.com";
const API_VERSION = "2026-03-10";
const BATCH_SIZE = 20;

/**
 * Resolve GitHub display names for a list of logins.
 * Uses `GET /users/{login}` in batches. Best-effort: failed lookups are silently skipped.
 * Returns a Map<login, displayName>.
 */
export async function resolveDisplayNames(
  logins: string[],
  token: string
): Promise<Map<string, string>> {
  const unique = [...new Set(logins.filter(Boolean))];
  const displayNameMap = new Map<string, string>();

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (login) => {
        const res = await fetch(
          `${GITHUB_API_BASE}/users/${encodeURIComponent(login)}`,
          {
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Bearer ${token}`,
              "X-GitHub-Api-Version": API_VERSION,
            },
          }
        );
        if (res.ok) {
          const user = await res.json();
          if (user.name) displayNameMap.set(login, user.name);
        }
      })
    );
    for (const r of results) {
      if (r.status === "rejected") {
        console.debug("Failed to fetch user profile:", r.reason);
      }
    }
  }

  return displayNameMap;
}

/**
 * Format a user label as "Display Name (username)" or just "username" if no display name.
 */
export function formatUserLabel(
  login: string,
  displayNameMap: Map<string, string>
): string {
  const name = displayNameMap.get(login);
  return name ? `${name} (${login})` : login;
}
