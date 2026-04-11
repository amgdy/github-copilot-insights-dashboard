import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit, getClientIp } from "@/lib/audit";
import {
  safeCompare,
  checkRateLimit,
  createSessionToken,
  sessionCookieOptions,
  COOKIE_NAMES,
  safeErrorMessage,
} from "@/lib/auth";

const schema = z.object({
  password: z.string().min(1),
});

/** Returns whether admin password protection is enabled. */
export async function GET() {
  const adminPassword = process.env.ADMIN_PASSWORD;
  return NextResponse.json({ required: !!adminPassword });
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request) ?? "unknown";

    if (!checkRateLimit(`admin-auth:${ip}`)) {
      logAudit({ action: "admin_login_rate_limited", category: "auth", ipAddress: ip });
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 },
      );
    }

    const body = await request.json();
    const { password } = schema.parse(body);

    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.warn("ADMIN_PASSWORD environment variable is not set — settings access is unrestricted");
      return NextResponse.json({ success: true });
    }

    if (!safeCompare(password, adminPassword)) {
      logAudit({ action: "admin_login_failed", category: "auth", ipAddress: ip });
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    logAudit({ action: "admin_login_success", category: "auth", ipAddress: ip });

    const token = createSessionToken("admin");
    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAMES.admin, token, sessionCookieOptions());
    return response;
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 },
      );
    }
    console.error("Admin auth error:", err);
    return NextResponse.json(
      { error: safeErrorMessage(err, "Authentication failed") },
      { status: 500 },
    );
  }
}
