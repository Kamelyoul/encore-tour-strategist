import { CITIES, REGION_LOCATION_QUERY, citiesIn, normalizeName, type Region } from "../geo/cities";
import { insightsQuery } from "./live";
import {
  ARTISTS,
  BRANDS,
  BRAND_CATEGORY_TAGS,
  CITY_PROFILES,
  DIMS,
  PLACE_ADJECTIVES,
  PLACE_KINDS,
  PODCASTS,
  TAGS,
  TV_SHOWS,
  type MockEntity,
  type Profile,
} from "./mock-data";
import { buildQueryString } from "./parse";
import type {
  Demographics,
  EntityType,
  HeatPoint,
  InsightsParams,
  QlooClient,
  QlooEntity,
  QlooRequestRecord,
  QlooTag,
  QueryParams,
} from "./types";

/** Deterministic 32-bit hash (FNV-1a) so the simulation is stable across runs. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic pseudo-random number in [0, 1) derived from a seed string. */
function rand(seed: string): number {
  return hash(seed) / 0x100000000;
}

function slug(text: string): string {
  return normalizeName(text).replace(/ /g, "_");
}

function vector(profile: Profile): number[] {
  return DIMS.map((d) => profile[d] ?? 0);
}

export function cosine(a: Profile, b: Profile): number {
  const va = vector(a);
  const vb = vector(b);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < va.length; i += 1) {
    dot += va[i] * vb[i];
    na += va[i] ** 2;
    nb += vb[i] ** 2;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function average(profiles: Profile[]): Profile {
  const out: Profile = {};
  if (!profiles.length) return out;
  for (const d of DIMS) {
    out[d] = profiles.reduce((sum, p) => sum + (p[d] ?? 0), 0) / profiles.length;
  }
  return out;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

const round = (x: number) => Math.round(x * 1000) / 1000;

interface Known {
  entity: MockEntity;
  type: EntityType;
  id: string;
}

const POOLS: Partial<Record<EntityType, MockEntity[]>> = {
  "urn:entity:artist": ARTISTS,
  "urn:entity:brand": BRANDS,
  "urn:entity:podcast": PODCASTS,
  "urn:entity:tv_show": TV_SHOWS,
};

const TYPE_SLUG: Partial<Record<EntityType, string>> = {
  "urn:entity:artist": "artist",
  "urn:entity:brand": "brand",
  "urn:entity:podcast": "podcast",
  "urn:entity:tv_show": "tv_show",
  "urn:entity:place": "place",
};

function idFor(type: EntityType, name: string): string {
  return `mock-${TYPE_SLUG[type] ?? "entity"}-${slug(name)}`;
}

/** A plausible taste profile for an artist the simulation has never heard of. */
function synthesizeProfile(name: string): Profile {
  const profile: Profile = {};
  const picks = [...DIMS].sort((a, b) => rand(`${name}:${a}`) - rand(`${name}:${b}`)).slice(0, 3);
  picks.forEach((d, i) => {
    profile[d] = 1 - i * 0.25;
  });
  return profile;
}

export interface MockClientOptions {
  /** Artificial latency per request so the UI animation is visible in demos. */
  latencyMs?: number;
}

/**
 * Offline stand-in for the Qloo API. Same interface and request log as the live client, so the
 * agent, UI and provenance panel behave identically; every number is simulated.
 */
export class MockQlooClient implements QlooClient {
  readonly mode = "mock" as const;
  readonly log: QlooRequestRecord[] = [];
  private readonly latencyMs: number;
  private readonly known = new Map<string, Known>();

  constructor(options: MockClientOptions = {}) {
    this.latencyMs = options.latencyMs ?? 0;
    for (const [type, pool] of Object.entries(POOLS) as [EntityType, MockEntity[]][]) {
      for (const entity of pool) {
        const id = idFor(type, entity.name);
        this.known.set(id, { entity, type, id });
      }
    }
  }

  private async record<T>(path: string, params: QueryParams, run: () => T, count: (r: T) => number): Promise<T> {
    const started = Date.now();
    if (this.latencyMs > 0) {
      const jitter = 0.6 + rand(`${path}${JSON.stringify(params)}`) * 0.8;
      await new Promise((r) => setTimeout(r, Math.round(this.latencyMs * jitter)));
    }
    const result = run();
    this.log.push({
      method: "GET",
      path,
      params: Object.fromEntries(new URLSearchParams(buildQueryString(params))),
      status: "ok",
      ms: Date.now() - started,
      resultCount: count(result),
      cached: false,
    });
    return result;
  }

  private toEntity(k: Known, affinity?: number, because: string[] = []): QlooEntity {
    const tags = TAGS.map((t) => ({ t, s: cosine(k.entity.profile, t.profile) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map(({ t }) => ({ id: t.id, name: t.name }));
    return {
      id: k.id,
      name: k.entity.name,
      type: k.type,
      subtype: k.entity.category,
      popularity: k.entity.popularity,
      affinity: affinity === undefined ? undefined : round(affinity),
      description: k.entity.description,
      tags,
      because,
    };
  }

  private signalProfile(entityIds: string[] = [], tagIds: string[] = []): { profile: Profile; names: string[] } {
    const profiles: Profile[] = [];
    const names: string[] = [];
    for (const id of entityIds) {
      const k = this.known.get(id);
      if (k) {
        profiles.push(k.entity.profile);
        names.push(k.entity.name);
      }
    }
    for (const id of tagIds) {
      const tag = TAGS.find((t) => t.id === id);
      if (tag) profiles.push(tag.profile);
    }
    return { profile: average(profiles), names };
  }

  async search(query: string, types?: EntityType[], take = 5): Promise<QlooEntity[]> {
    const wanted = types?.length ? types : (Object.keys(POOLS) as EntityType[]);
    return this.record(
      "/search",
      { query, types: wanted, take },
      () => {
        const q = normalizeName(query);
        if (!q) return [];
        const matches = [...this.known.values()]
          .filter((k) => wanted.includes(k.type))
          .map((k) => {
            const n = normalizeName(k.entity.name);
            const score = n === q ? 3 : n.startsWith(q) ? 2 : n.includes(q) || q.includes(n) ? 1 : 0;
            return { k, score };
          })
          .filter((m) => m.score > 0)
          .sort((a, b) => b.score - a.score || b.k.entity.popularity - a.k.entity.popularity)
          .slice(0, take)
          .map(({ k }) => this.toEntity(k));
        if (matches.length || !wanted.includes("urn:entity:artist")) return matches;
        // Unknown artist: synthesise one so any name works in the offline demo.
        const name = query.trim().replace(/\s+/g, " ").slice(0, 60);
        const k: Known = {
          id: idFor("urn:entity:artist", name),
          type: "urn:entity:artist",
          entity: { name, popularity: round(0.3 + rand(name) * 0.4), profile: synthesizeProfile(name) },
        };
        this.known.set(k.id, k);
        return [this.toEntity(k)];
      },
      (r) => r.length,
    );
  }

  async findTags(query: string, take = 8): Promise<QlooTag[]> {
    return this.record(
      "/v2/tags",
      { "filter.query": query, "feature.semantic_search": true, take },
      () => {
        const q = normalizeName(query);
        const words = q.split(" ").filter(Boolean);
        const categories: QlooTag[] = BRAND_CATEGORY_TAGS.filter((c) =>
          c.keywords.some((kw) => words.includes(kw) || q.includes(kw)),
        ).map((c) => ({ id: c.id, name: c.name, type: "urn:tag:category:brand" }));
        const tastes: QlooTag[] = TAGS.filter((t) => normalizeName(t.name).includes(q)).map((t) => ({
          id: t.id,
          name: t.name,
          type: t.id.split(":").slice(0, 3).join(":"),
        }));
        return [...categories, ...tastes].slice(0, take);
      },
      (r) => r.length,
    );
  }

  private placesFor(cityName: string): Known[] {
    const city = CITIES.find((c) => normalizeName(c.name) === normalizeName(cityName));
    const base = (city && CITY_PROFILES[city.name]) || {};
    const out: Known[] = [];
    for (const kind of PLACE_KINDS) {
      for (let i = 0; i < 2; i += 1) {
        const seed = `${cityName}:${kind.subtype}:${i}`;
        const adjective = PLACE_ADJECTIVES[hash(seed) % PLACE_ADJECTIVES.length];
        const word = kind.words[hash(`${seed}:w`) % kind.words.length];
        const name = `${adjective} ${word}`;
        const profile: Profile = {};
        for (const d of DIMS) {
          profile[d] = clamp01((base[d] ?? 0.2) * 0.5 + rand(`${seed}:${d}`) * 0.7);
        }
        const id = idFor("urn:entity:place", `${cityName} ${name}`);
        const k: Known = {
          id,
          type: "urn:entity:place",
          entity: {
            name,
            category: kind.label,
            popularity: round(0.2 + rand(`${seed}:pop`) * 0.6),
            profile,
            description: `${kind.label} in ${city?.name ?? cityName} (simulated venue).`,
          },
        };
        this.known.set(id, k);
        out.push(k);
      }
    }
    return out;
  }

  async insightsEntities(params: InsightsParams): Promise<QlooEntity[]> {
    return this.record(
      "/v2/insights",
      insightsQuery(params),
      () => {
        const type = params.filterType as EntityType;
        const { profile, names } = this.signalProfile(params.signalEntities, params.signalTags);
        let pool: Known[];
        if (type === "urn:entity:place") {
          pool = params.filterLocationQuery ? this.placesFor(params.filterLocationQuery) : [];
        } else {
          pool = (POOLS[type] ?? []).map((e) => this.known.get(idFor(type, e.name))!).filter(Boolean);
        }
        const exclude = new Set([...(params.excludeEntities ?? []), ...(params.signalEntities ?? [])]);
        const categories = (params.filterTags ?? [])
          .map((id) => BRAND_CATEGORY_TAGS.find((c) => c.id === id)?.category)
          .filter((c): c is string => !!c);
        const take = params.take ?? 10;
        return pool
          .filter((k) => !exclude.has(k.id))
          .filter((k) => !categories.length || (k.entity.category && categories.includes(k.entity.category)))
          .filter((k) => params.popularityMax === undefined || k.entity.popularity <= params.popularityMax)
          .filter((k) => params.popularityMin === undefined || k.entity.popularity >= params.popularityMin)
          .filter((k) => !params.filterEntities?.length || params.filterEntities.includes(k.id))
          .map((k) => {
            const affinity = clamp01(0.15 + 0.8 * cosine(profile, k.entity.profile) + (rand(k.id) - 0.5) * 0.06);
            return { k, affinity };
          })
          .sort((a, b) => b.affinity - a.affinity)
          .slice(0, take)
          .map(({ k, affinity }) => this.toEntity(k, affinity, params.explain ? names : []));
      },
      (r) => r.length,
    );
  }

  async insightsTags(signalEntities: string[], take = 12): Promise<QlooTag[]> {
    return this.record(
      "/v2/insights",
      insightsQuery({ filterType: "urn:tag", signalEntities, take }),
      () => {
        const { profile } = this.signalProfile(signalEntities);
        return TAGS.map((t) => ({
          id: t.id,
          name: t.name,
          type: t.id.split(":").slice(0, 3).join(":"),
          affinity: round(clamp01(0.1 + 0.85 * cosine(profile, t.profile) + (rand(t.id) - 0.5) * 0.05)),
        }))
          .sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0))
          .slice(0, take);
      },
      (r) => r.length,
    );
  }

  async demographics(signalEntities: string[]): Promise<Demographics | null> {
    return this.record(
      "/v2/insights",
      insightsQuery({ filterType: "urn:demographics", signalEntities }),
      () => {
        const { profile } = this.signalProfile(signalEntities);
        if (!Object.keys(profile).length) return null;
        const p = (d: keyof Profile) => profile[d] ?? 0;
        const youth = (p("electronic") + p("hiphop") + p("pop") + p("latin")) / 4;
        const maturity = (p("country") + p("soul") + p("rock")) / 3;
        const indie = p("indie") + p("psych") * 0.5;
        const lean = youth - maturity;
        const age: Record<string, number> = {
          "24_and_younger": round(lean * 0.8 + 0.05),
          "25_to_29": round(lean * 0.4 + indie * 0.25),
          "30_to_34": round(indie * 0.3 + 0.05),
          "35_to_44": round(-lean * 0.3 + indie * 0.05),
          "45_to_54": round(-lean * 0.6 - 0.1),
          "55_and_older": round(-lean * 0.8 - 0.25),
        };
        const masc = p("country") * 0.3 + p("electronic") * 0.2 + p("rock") * 0.2 + p("psych") * 0.1;
        const fem = p("pop") * 0.35 + p("indie") * 0.25 + p("soul") * 0.1;
        return { age, gender: { male: round(masc - fem), female: round(fem - masc) } };
      },
      (r) => (r ? 1 : 0),
    );
  }

  async heatmap(signalEntity: string, locationQuery?: string, take = 50): Promise<HeatPoint[]> {
    return this.record(
      "/v2/insights",
      insightsQuery({
        filterType: "urn:heatmap",
        signalEntities: [signalEntity],
        filterLocationQuery: locationQuery,
        take,
        extra: { "output.heatmap.boundary": "urn:entity:locality" },
      }),
      () => {
        const { profile } = this.signalProfile([signalEntity]);
        const region = (Object.entries(REGION_LOCATION_QUERY) as [Region, string][]).find(
          ([, q]) => locationQuery && normalizeName(q) === normalizeName(locationQuery),
        )?.[0];
        const pool = region ? citiesIn(region).filter((c) => c.country === "US") : CITIES;
        return pool
          .map((city) => {
            const cityProfile = CITY_PROFILES[city.name] ?? {};
            const fit = cosine(profile, cityProfile);
            // Big metros have broad taste, so they keep some affinity for most audiences.
            const breadth = Math.log10(1 + city.pop) / 1.35;
            const affinity = clamp01(
              0.06 + 0.64 * fit ** 1.5 + 0.28 * breadth + (rand(`${signalEntity}:${city.name}`) - 0.5) * 0.08,
            );
            return {
              latitude: city.lat + (rand(`${city.name}:lat`) - 0.5) * 0.1,
              longitude: city.lon + (rand(`${city.name}:lon`) - 0.5) * 0.1,
              name: city.name,
              affinity: round(affinity),
              popularity: round(clamp01(Math.log10(1 + city.pop) / 1.6)),
            };
          })
          .sort((a, b) => b.affinity - a.affinity)
          .slice(0, take);
      },
      (r) => r.length,
    );
  }
}
