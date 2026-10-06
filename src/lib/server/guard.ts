import type { AgentEvent } from "../agent/types";

/** Small in-memory protections for the public demo (one serverless instance = one memory). */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_RUNS_PER_WINDOW = 12;
/** Cap for the whole instance, so a client rotating IPs cannot burn the API quotas. */
const MAX_GLOBAL_RUNS_PER_WINDOW = 60;
const hits = new Map<string, number[]>();
let globalHits: number[] = [];

/** Client IP as set by the Vercel edge (x-real-ip cannot be forged by the client). */
export function clientIp(headers: Headers): string {
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export function allowRun(ip: string, now = Date.now()): boolean {
  globalHits = globalHits.filter((t) => now - t < WINDOW_MS);
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_RUNS_PER_WINDOW || globalHits.length >= MAX_GLOBAL_RUNS_PER_WINDOW) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  globalHits.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.delete(hits.keys().next().value!);
  return true;
}

export interface RecordedRun {
  expires: number;
  events: { at: number; event: AgentEvent }[];
}

const RUN_TTL_MS = 60 * 60 * 1000;
const runs = new Map<string, RecordedRun>();

export function runKey(brief: string, mode: string): string {
  return `${mode}::${brief.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export function getRecordedRun(key: string, now = Date.now()): RecordedRun | undefined {
  const run = runs.get(key);
  if (run && run.expires > now) return run;
  if (run) runs.delete(key);
  return undefined;
}

export function saveRecordedRun(key: string, events: RecordedRun["events"], now = Date.now()) {
  if (runs.size >= 200) runs.delete(runs.keys().next().value!);
  runs.set(key, { expires: now + RUN_TTL_MS, events });
}
