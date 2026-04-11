import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side authentication proxy.
 * Protects API routes based on required auth level:
 *   - Public routes (auth endpoints) → pass through
 *   - Dashboard routes (metrics, filters, users) → require dashboard session cookie
 *   - Admin routes (settings, admin, ingest, audit-log) → require admin session cookie
 *
 * Uses Web Crypto API (Edge-compatible) for HMAC verification.
 */

const COOKIE_DASHBOARD = "dashboard_session";
const COOKIE_ADMIN = "admin_session";
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
const SIGNING_SALT = "copilot-insights-session-v1";

/** Routes that never require authentication. */
const PUBLIC_PREFIXES = ["/api/auth/"];

/** Routes that require admin-level authentication. */
const ADMIN_PREFIXES = [
  "/api/admin",
  "/api/settings",
  "/api/ingest",
  "/api/audit-log",
];

/* ── Web Crypto helpers (Edge-compatible) ── */

const encoder = new TextEncoder();

async function hmacSign(key: ArrayBuffer, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function deriveKey(password: string): Promise<ArrayBuffer> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SIGNING_SALT),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", baseKey, encoder.encode(password));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  return atob(padded);
}

async function verifyToken(
  token: string,
  type: "dashboard" | "admin",
): Promise<boolean> {
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
    payload = base64UrlDecode(payloadB64);
  } catch {
    return false;
  }

  const colonIdx = payload.indexOf(":");
  if (colonIdx < 0) return false;

  const tokenType = payload.slice(0, colonIdx);
  const timestampStr = payload.slice(colonIdx + 1);

  if (tokenType !== type) return false;

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp) || Date.now() - timestamp > TOKEN_EXPIRY_MS)
    return false;

  const key = await deriveKey(password);
  const expectedSignature = await hmacSign(key, payload);

  return constantTimeEqual(signature, expectedSignature);
}

/* ── Proxy handler ── */

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply to API routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Public routes — always allowed
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check if this is an admin-level route
  const isAdminRoute = ADMIN_PREFIXES.some((p) => pathname.startsWith(p));

  if (isAdminRoute) {
    if (!process.env.ADMIN_PASSWORD) return NextResponse.next();

    const token = request.cookies.get(COOKIE_ADMIN)?.value;
    if (!token || !(await verifyToken(token, "admin"))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // All other /api/* routes require dashboard authentication
  if (!process.env.DASHBOARD_PASSWORD) return NextResponse.next();

  const token = request.cookies.get(COOKIE_DASHBOARD)?.value;
  if (!token || !(await verifyToken(token, "dashboard"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
