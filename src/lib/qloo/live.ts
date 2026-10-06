import {
  buildQueryString,
  normalizeDemographics,
  normalizeEntity,
  normalizeHeatPoint,
  normalizeTag,
  resultList,
} from "./parse";
import {
  QlooError,
  type Demographics,
  type EntityType,
  type HeatPoint,
  type InsightsParams,
  type QlooClient,
  type QlooEntity,
  type QlooRequestRecord,
  type QlooTag,
  type QueryParams,
} from "./types";

export const DEFAULT_QLOO_URL = "https://hackathon.api.qloo.com";

interface CacheEntry {
  expires: number;
  body: unknown;
}

/** Process-wide response cache: protects the hackathon quota when judges replay the same demo. */
const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 500;

export function clearQlooCache() {
  responseCache.clear();
}

export interface LiveClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Turns typed insights params into Qloo's dotted query parameters. */
export function insightsQuery(p: InsightsParams): QueryParams {
  const q: QueryParams = {
    "filter.type": p.filterType,
    "signal.interests.entities": p.signalEntities,
    "signal.interests.tags": p.signalTags,
    "filter.tags": p.filterTags,
    "filter.exclude.tags": p.excludeTags,
    "filter.location.query": p.filterLocationQuery,
    "signal.location.query": p.signalLocationQuery,
    "filter.results.entities": p.filterEntities,
    "filter.exclude.entities": p.excludeEntities,
    "filter.popularity.max": p.popularityMax,
    "filter.popularity.min": p.popularityMin,
    take: p.take,
  };
  if (p.filterTags?.length) q["operator.filter.tags"] = "union";
  if (p.excludeTags?.length) q["operator.filter.exclude.tags"] = "union";
  if (p.explain) q["feature.explainability"] = true;
  return { ...q, ...p.extra };
}

export class LiveQlooClient implements QlooClient {
  readonly mode = "live" as const;
  readonly log: QlooRequestRecord[] = [];
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: LiveClientOptions) {
    if (!options.apiKey?.trim()) throw new QlooError("QLOO_API_KEY is missing");
    this.baseUrl = (options.baseUrl ?? DEFAULT_QLOO_URL).replace(/\/+$/, "");
    if (!/^https:\/\//.test(this.baseUrl)) throw new QlooError("QLOO_API_URL must use https");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** GET with timeout, bounded retries on 429/5xx, and a TTL cache. Never logs the key. */
  async get(path: string, params: QueryParams, countKey: string): Promise<unknown> {
    const qs = buildQueryString(params);
    const url = `${this.baseUrl}${path}${qs ? `?${qs}` : ""}`;
    const loggedParams = Object.fromEntries(new URLSearchParams(qs));
    const started = Date.now();

    const hit = responseCache.get(url);
    if (hit && hit.expires > Date.now()) {
      this.log.push({
        method: "GET",
        path,
        params: loggedParams,
        status: "ok",
        ms: 0,
        resultCount: resultList(hit.body, countKey).length,
        cached: true,
      });
      return hit.body;
    }

    let lastError: QlooError | undefined;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url, {
          method: "GET",
          headers: { Accept: "application/json", "X-Api-Key": this.options.apiKey },
          signal: controller.signal,
        });
        const text = await res.text();
        let body: unknown = {};
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          throw new QlooError(`Qloo returned invalid JSON (HTTP ${res.status})`, res.status, res.status >= 500);
        }
        if (!res.ok) {
          const retryable = res.status === 429 || res.status >= 500;
          const message =
            (typeof (body as { message?: unknown }).message === "string" &&
              (body as { message: string }).message) ||
            `Qloo HTTP ${res.status}`;
          throw new QlooError(message, res.status, retryable);
        }
        if (responseCache.size >= CACHE_MAX) {
          const oldest = responseCache.keys().next().value;
          if (oldest !== undefined) responseCache.delete(oldest);
        }
        responseCache.set(url, { expires: Date.now() + CACHE_TTL_MS, body });
        this.log.push({
          method: "GET",
          path,
          params: loggedParams,
          status: "ok",
          ms: Date.now() - started,
          resultCount: resultList(body, countKey).length,
          cached: false,
        });
        return body;
      } catch (error) {
        lastError =
          error instanceof QlooError
            ? error
            : new QlooError(
                controller.signal.aborted ? "Qloo request timed out" : "Could not reach Qloo",
                undefined,
                true,
              );
        if (!lastError.retryable || attempt === this.maxAttempts) break;
        await this.sleep(300 * 2 ** (attempt - 1));
      } finally {
        clearTimeout(timer);
      }
    }
    this.log.push({
      method: "GET",
      path,
      params: loggedParams,
      status: "error",
      ms: Date.now() - started,
      resultCount: 0,
      cached: false,
      error: lastError?.message,
    });
    throw lastError ?? new QlooError("Unknown Qloo error");
  }

  async search(query: string, types?: EntityType[], take = 5): Promise<QlooEntity[]> {
    const body = await this.get("/search", { query, types, take }, "entities");
    return resultList(body, "entities").map(normalizeEntity).filter((e): e is QlooEntity => !!e);
  }

  async findTags(query: string, take = 8): Promise<QlooTag[]> {
    const body = await this.get(
      "/v2/tags",
      { "filter.query": query, "feature.semantic_search": true, take },
      "tags",
    );
    return resultList(body, "tags").map(normalizeTag).filter((t): t is QlooTag => !!t);
  }

  async insightsEntities(params: InsightsParams): Promise<QlooEntity[]> {
    const body = await this.get("/v2/insights", insightsQuery(params), "entities");
    return resultList(body, "entities").map(normalizeEntity).filter((e): e is QlooEntity => !!e);
  }

  async insightsTags(signalEntities: string[], take = 12): Promise<QlooTag[]> {
    const body = await this.get(
      "/v2/insights",
      insightsQuery({ filterType: "urn:tag", signalEntities, take }),
      "tags",
    );
    return resultList(body, "tags").map(normalizeTag).filter((t): t is QlooTag => !!t);
  }

  async demographics(signalEntities: string[]): Promise<Demographics | null> {
    const body = await this.get(
      "/v2/insights",
      insightsQuery({ filterType: "urn:demographics", signalEntities }),
      "demographics",
    );
    return normalizeDemographics(body);
  }

  async heatmap(signalEntity: string, locationQuery?: string, take = 50): Promise<HeatPoint[]> {
    const body = await this.get(
      "/v2/insights",
      insightsQuery({
        filterType: "urn:heatmap",
        signalEntities: [signalEntity],
        filterLocationQuery: locationQuery,
        take,
        extra: { "output.heatmap.boundary": "urn:entity:locality" },
      }),
      "heatmap",
    );
    return resultList(body, "heatmap").map(normalizeHeatPoint).filter((p): p is HeatPoint => !!p);
  }
}
