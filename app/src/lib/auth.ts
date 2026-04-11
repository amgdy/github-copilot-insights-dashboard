import { timingSafeEqual, createHmac } from "crypto";
import { NextResponse } from "next/server";

/* ── Constants ── */

const COOKIE_DASHBOARD = "dashboard_session";
const COOKIE_ADMIN = "admin_session";
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const SIGNING_SALT = "copilot-insights-session-v1";

/* ── Rate Limiter ── */

interface RateEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateEntry>();

const RATE_LIMIT_MAX = 10; // max attempts
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

/** Returns true if the request is allowed, false if rate-limited. */
export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

/* ── Timing-safe Password Comparison ── */

/** Constant-time string comparison to prevent timing attacks. */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    // Still perform a compare to avoid leaking length difference via timing
    timingSafeEqual(bufA, bufA);
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

/* ── Session Token (HMAC-signed, stateless) ── */

function getSigningKey(password: string): Buffer {
  return createHmac("sha256", SIGNING_SALT).update(password).digest();
}

export function createSessionToken(type: "dashboard" | "admin"): string {
  const password =
    type === "dashboard"
      ? process.env.DASHBOARD_PASSWORD
      : process.env.ADMIN_PASSWORD;

  if (!password) return "";

  const payload = `${type}:${Date.now()}`;
  const key = getSigningKey(password);
  const signature = createHmac("sha256", key).update(payload).digest("hex");

  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

function verifySessionToken(
  token: string,
  type: "dashboard" | "admin",
): boolean {
  const password =
    type === "dashboard"
      ? process.env.DASHBOARD_PASSWORD
      : process.env.ADMIN_PASSWORD;

  if (!password) return true; // No password configured = open access
  if (!token) return false;

  const dotIdx = token.indexOf(".");
  if (dotIdx < 0) return false;

  const payloadB64 = token.slice(0, dotIdx);
  const signature = token.slice(dotIdx + 1);
  if (!payloadB64 || !signature) return false;

  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString();
  } catch {
    return false;
  }

  const colonIdx = payload.indexOf(":");
  if (colonIdx < 0) return false;

  const tokenType = payload.slice(0, colonIdx);
  const timestampStr = payload.slice(colonIdx + 1);

  if (tokenType !== type) return false;

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp) || Date.now() - timestamp > TOKEN_EXPIRY_MS) return false;

  const key = getSigningKey(password);
  const expectedSignature = createHmac("sha256", key)
    .update(payload)
    .digest("hex");

  try {
    return safeCompare(signature, expectedSignature);
  } catch {
    return false;
  }
}

/* ── Cookie Helpers ── */

function getCookieValue(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  // Use simple split approach — safe since cookie names/values don't contain `;` or `=`
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return undefined;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(TOKEN_EXPIRY_MS / 1000),
  };
}

export const COOKIE_NAMES = { dashboard: COOKIE_DASHBOARD, admin: COOKIE_ADMIN } as const;

/* ── Auth Guards ── */

/**
 * Verify the caller has dashboard-level authentication.
 * Returns null if access is allowed, or a 401 response to return immediately.
 */
export function requireDashboardAuth(request: Request): NextResponse | null {
  if (!process.env.DASHBOARD_PASSWORD) return null; // open access

  const token = getCookieValue(request, COOKIE_DASHBOARD);
  if (token && verifySessionToken(token, "dashboard")) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Verify the caller has admin-level authentication.
 * Returns null if access is allowed, or a 401 response to return immediately.
 */
export function requireAdminAuth(request: Request): NextResponse | null {
  if (!process.env.ADMIN_PASSWORD) return null; // open access

  const token = getCookieValue(request, COOKIE_ADMIN);
  if (token && verifySessionToken(token, "admin")) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/* ── Error Sanitization ── */

/** Return a safe error message — real message in dev, generic fallback in prod. */
export function safeErrorMessage(err: unknown, fallback: string): string {
  if (process.env.NODE_ENV === "development") {
    return err instanceof Error ? err.message : fallback;
  }
  return fallback;
}
