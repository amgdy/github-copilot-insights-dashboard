import { ingestFromFile } from "@/lib/etl/ingest";
import type { CopilotUsageRecord } from "@/types/copilot-api";
import { logAudit, getClientIp } from "@/lib/audit";
import { safeErrorMessage } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return new Response(
      JSON.stringify({ error: "Expected multipart/form-data with an NDJSON file." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  let records: CopilotUsageRecord[];

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ error: "No file provided. Upload an NDJSON metrics file." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const text = await file.text();

    // Parse NDJSON: each line is a JSON object
    records = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line, idx) => {
        try {
          return JSON.parse(line) as CopilotUsageRecord;
        } catch {
          throw new Error(`Invalid JSON on line ${idx + 1}`);
        }
      });

    // Basic validation: check first record has expected fields
    if (records.length > 0) {
      const first = records[0];
      if (!first.day || first.user_id === undefined || !first.user_login) {
        return new Response(
          JSON.stringify({ error: "File does not appear to be a valid Copilot usage NDJSON file. Expected fields: day, user_id, user_login." }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: safeErrorMessage(err, "Failed to parse file") }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Stream the ingestion progress via SSE
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: string) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type, message: data })}\n\n`)
        );
      };

      send("log", `[${new Date().toISOString()}] File upload ingestion started — ${records.length} records`);

      try {
        const result = await ingestFromFile({
          records,
          onLog: (msg) => {
            send("log", `[${new Date().toISOString()}] ${msg}`);
          },
        });

        logAudit({
          action: "data_sync_upload",
          category: "data_sync",
          details: { recordCount: records.length },
          ipAddress: getClientIp(request),
        });

        send("done", JSON.stringify(result));
      } catch (err) {
        const message = safeErrorMessage(err, "Ingestion failed");
        send("error", message);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
