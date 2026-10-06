import { DEFAULT_QLOO_URL, LiveQlooClient } from "./live";
import { MockQlooClient } from "./mock";
import { QlooError, type QlooClient } from "./types";

type Env = Record<string, string | undefined>;

/**
 * live  -> QLOO_API_KEY is set (or QLOO_MODE=live)
 * mock  -> no key, or QLOO_MODE=mock (offline simulation, clearly labelled in the UI)
 */
export function qlooMode(env: Env = process.env): "live" | "mock" {
  const forced = env.QLOO_MODE?.trim().toLowerCase();
  if (forced === "mock") return "mock";
  if (forced === "live") return "live";
  return env.QLOO_API_KEY?.trim() ? "live" : "mock";
}

/** One client per agent run, so its request log is the provenance of that run only. */
export function createQlooClient(env: Env = process.env): QlooClient {
  if (qlooMode(env) === "mock") {
    const latency = Number(env.ENCORE_MOCK_LATENCY_MS ?? 220);
    return new MockQlooClient({ latencyMs: Number.isFinite(latency) ? latency : 220 });
  }
  const apiKey = env.QLOO_API_KEY?.trim();
  if (!apiKey) throw new QlooError("QLOO_MODE=live but QLOO_API_KEY is not set");
  return new LiveQlooClient({ apiKey, baseUrl: env.QLOO_API_URL?.trim() || DEFAULT_QLOO_URL });
}
