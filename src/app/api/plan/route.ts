import { z } from "zod";
import { llmConfig } from "@/lib/agent/llm";
import { MAX_BRIEF_LENGTH } from "@/lib/agent/request";
import { runEncore } from "@/lib/agent/run";
import { messageOf } from "@/lib/agent/toolkit";
import type { AgentEvent } from "@/lib/agent/types";
import { qlooMode } from "@/lib/qloo/client";
import { allowRun, getRecordedRun, runKey, saveRecordedRun } from "@/lib/server/guard";

export const maxDuration = 60;

const Body = z.object({ brief: z.string().trim().min(3).max(MAX_BRIEF_LENGTH) });

/** Streams the agent's run as newline-delimited JSON events (see AgentEvent). */
export async function POST(request: Request) {
  let brief: string;
  try {
    brief = Body.parse(await request.json()).brief;
  } catch {
    return Response.json({ error: `Send {"brief": "..."} (3 to ${MAX_BRIEF_LENGTH} characters).` }, { status: 400 });
  }

  const llm = llmConfig();
  const key = runKey(brief, `${qlooMode()}|${llm?.id ?? "scripted"}`);
  const recorded = getRecordedRun(key);
  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!recorded && !allowRun(ip)) {
    return Response.json(
      { error: "Demo rate limit reached (12 plans per 10 minutes). Try one of the example briefs: they are cached." },
      { status: 429 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      const started = Date.now();
      try {
        if (recorded) {
          // Replay a cached run with compressed timing: same story, no Qloo or LLM quota spent.
          let last = 0;
          for (const { at, event } of recorded.events) {
            const wait = Math.min(120, at - last);
            last = at;
            if (wait > 0) await new Promise((r) => setTimeout(r, wait));
            send(event.type === "done" ? { ...event, replayed: true } : event);
          }
          return;
        }
        const events: { at: number; event: AgentEvent }[] = [];
        const emit = (event: AgentEvent) => {
          events.push({ at: Date.now() - started, event });
          send(event);
        };
        await runEncore(brief, emit, { llm });
        emit({ type: "done", ms: Date.now() - started });
        saveRecordedRun(key, events);
      } catch (error) {
        send({ type: "error", message: messageOf(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
