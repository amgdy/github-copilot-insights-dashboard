import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { desc, eq, and, gte, lte, sql } from "drizzle-orm";
import { isValidDate } from "@/lib/utils";

const querySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().min(10).max(100).optional().default(50),
  category: z.string().optional(),
  start: z.string().refine(isValidDate).optional(),
  end: z.string().refine(isValidDate).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const params = querySchema.parse({
      page: sp.get("page") ?? undefined,
      pageSize: sp.get("pageSize") ?? undefined,
      category: sp.get("category") ?? undefined,
      start: sp.get("start") ?? undefined,
      end: sp.get("end") ?? undefined,
    });

    const conditions = [];
    if (params.category) {
      conditions.push(eq(auditLog.category, params.category));
    }
    if (params.start) {
      conditions.push(gte(auditLog.createdAt, new Date(`${params.start}T00:00:00Z`)));
    }
    if (params.end) {
      conditions.push(lte(auditLog.createdAt, new Date(`${params.end}T23:59:59Z`)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(auditLog)
        .where(where)
        .orderBy(desc(auditLog.createdAt))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLog)
        .where(where),
    ]);

    return NextResponse.json({
      data: rows,
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total: countResult[0]?.count ?? 0,
      },
    });
  } catch (error) {
    console.error("Failed to fetch audit log:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
