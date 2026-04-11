import { getGitHubConfig, getSyncScopeConfig } from "@/lib/db/settings";
import { ingestCopilotUsage } from "@/lib/etl/ingest";
import { safeErrorMessage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const { token, enterpriseSlug: slug } = await getGitHubConfig();
  const { scopes, orgLogins } = await getSyncScopeConfig();

  if (!token || !slug) {
    return new Response(
      JSON.stringify({ error: "GitHub token and enterprise slug must be configured." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: string) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type, message: data })}\n\n`)
        );
      };

      send("log", `[${new Date().toISOString()}] Ingestion started`);

      try {
        const result = await ingestCopilotUsage({
          enterpriseSlug: slug,
          token,
          scopes,
          orgLogins,
          onLog: (msg) => {
            send("log", `[${new Date().toISOString()}] ${msg}`);
          },
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
