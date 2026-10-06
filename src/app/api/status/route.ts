import { connection } from "next/server";
import { llmConfig } from "@/lib/agent/llm";
import { qlooMode } from "@/lib/qloo/client";

/** Which data source and agent brain this deployment runs with (never exposes keys). */
export async function GET() {
  await connection();
  const llm = llmConfig();
  return Response.json(
    { qloo: qlooMode(), llm: llm ? { mode: "llm", model: llm.id } : { mode: "scripted" } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
