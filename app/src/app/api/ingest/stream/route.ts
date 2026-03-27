import { getGitHubConfig } from "@/lib/db/settings";
import { ingestCopilotUsage } from "@/lib/etl/ingest";

export const dynamic = "force-dynamic";

export async function POST() {
  const { token, enterpriseSlug: slug } = await getGitHubConfig();

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
          onLog: (msg) => {
            send("log", `[${new Date().toISOString()}] ${msg}`);
          },
        });

        send("done", JSON.stringify(result));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Ingestion failed";
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
