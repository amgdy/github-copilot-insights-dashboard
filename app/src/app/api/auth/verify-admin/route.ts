import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = schema.parse(body);

    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.warn("ADMIN_PASSWORD environment variable is not set — settings access is unrestricted");
      return NextResponse.json({ success: true });
    }

    if (password !== adminPassword) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : "Authentication failed";
    console.error("Admin auth error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
