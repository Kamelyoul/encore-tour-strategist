import type { Demographics, HeatPoint, QlooEntity, QlooTag, QueryParams } from "./types";

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Rec)
    : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

/** Serialises query params the way Qloo expects: arrays are comma-joined, empty values dropped. */
export function buildQueryString(params: QueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      const joined = value.filter((v) => v !== "").join(",");
      if (joined) search.set(key, joined);
      continue;
    }
    search.set(key, String(value));
  }
  return search.toString();
}

/** Qloo returns either `results: [...]` (search) or `results: { entities: [...] }` (insights). */
export function resultList(raw: unknown, key: string): unknown[] {
  const results = rec(raw)?.results;
  if (Array.isArray(results)) return results;
  const inner = rec(results)?.[key];
  return Array.isArray(inner) ? inner : [];
}

function imageOf(properties: Rec | undefined): string | undefined {
  const image = properties?.image;
  return str(image) ?? str(rec(image)?.url);
}

function tagsOf(value: unknown): { id: string; name: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { id: string; name: string }[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      out.push({ id: item, name: prettifyTagId(item) });
      continue;
    }
    const tag = rec(item);
    const id = str(tag?.id) ?? str(tag?.tag_id) ?? str(tag?.value);
    if (!id) continue;
    out.push({ id, name: str(tag?.name) ?? prettifyTagId(id) });
  }
  return out;
}

/** "urn:tag:genre:media:indie_rock" -> "Indie Rock" */
export function prettifyTagId(id: string): string {
  const last = id.split(":").pop() ?? id;
  return last
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Collects the names of signal entities listed in a `query.explainability` object. */
export function explainNames(explainability: unknown): string[] {
  const names = new Set<string>();
  const visit = (value: unknown, depth: number) => {
    if (depth > 4) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const r = rec(value);
    if (!r) return;
    const name = str(r.name);
    if (name && (r.entity_id !== undefined || r.score !== undefined || r.id !== undefined)) names.add(name);
    for (const child of Object.values(r)) if (typeof child === "object") visit(child, depth + 1);
  };
  visit(explainability, 0);
  return [...names];
}

export function normalizeEntity(raw: unknown): QlooEntity | undefined {
  const e = rec(raw);
  if (!e) return undefined;
  const id = str(e.entity_id) ?? str(e.id);
  const name = str(e.name);
  if (!id || !name) return undefined;
  const properties = rec(e.properties);
  const query = rec(e.query);
  const geocode = rec(properties?.geocode);
  const types = Array.isArray(e.types) ? e.types.filter((t): t is string => typeof t === "string") : [];
  return {
    id,
    name,
    type: str(e.type) ?? types[0],
    subtype: str(e.subtype),
    popularity: num(e.popularity),
    affinity: num(e.affinity) ?? num(query?.affinity),
    description:
      str(properties?.short_description) ?? str(properties?.description) ?? str(e.short_description),
    image: imageOf(properties),
    address: str(properties?.address) ?? str(e.address),
    city: str(geocode?.city) ?? str(geocode?.name),
    country: str(geocode?.country_code),
    priceLevel: num(properties?.price_level),
    rating: num(properties?.business_rating) ?? num(properties?.rating),
    tags: tagsOf(e.tags),
    because: explainNames(query?.explainability),
  };
}

export function normalizeTag(raw: unknown): QlooTag | undefined {
  const t = rec(raw);
  if (!t) return undefined;
  const id = str(t.id) ?? str(t.tag_id);
  if (!id) return undefined;
  const query = rec(t.query);
  return {
    id,
    name: str(t.name) ?? prettifyTagId(id),
    type: str(t.type) ?? str(t.subtype),
    affinity: num(t.affinity) ?? num(query?.affinity),
    popularity: num(t.popularity),
  };
}

const GEOHASH_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Decodes a geohash to the centre of its cell. */
export function decodeGeohash(hash: string): { latitude: number; longitude: number } | undefined {
  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;
  let even = true;
  for (const ch of hash.toLowerCase()) {
    const idx = GEOHASH_BASE32.indexOf(ch);
    if (idx < 0) return undefined;
    for (let bit = 4; bit >= 0; bit -= 1) {
      const on = (idx >> bit) & 1;
      if (even) {
        const mid = (lonMin + lonMax) / 2;
        if (on) lonMin = mid;
        else lonMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (on) latMin = mid;
        else latMax = mid;
      }
      even = !even;
    }
  }
  if (!hash) return undefined;
  return { latitude: (latMin + latMax) / 2, longitude: (lonMin + lonMax) / 2 };
}

export function normalizeHeatPoint(raw: unknown): HeatPoint | undefined {
  const p = rec(raw);
  if (!p) return undefined;
  const location = rec(p.location) ?? p;
  const query = rec(p.query);
  const affinity = num(query?.affinity) ?? num(p.affinity);
  if (affinity === undefined) return undefined;
  let latitude = num(location.latitude) ?? num(location.lat);
  let longitude = num(location.longitude) ?? num(location.lon) ?? num(location.lng);
  if (latitude === undefined || longitude === undefined) {
    const hash = str(location.geohash) ?? str(p.geohash);
    const decoded = hash ? decodeGeohash(hash) : undefined;
    if (!decoded) return undefined;
    latitude = decoded.latitude;
    longitude = decoded.longitude;
  }
  return {
    latitude,
    longitude,
    name: str(location.name) ?? str(p.name),
    affinity,
    popularity: num(query?.popularity) ?? num(p.popularity),
  };
}

function numberRecord(value: unknown): Record<string, number> {
  const r = rec(value);
  if (!r) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(r)) {
    const n = num(v);
    if (n !== undefined) out[k] = n;
  }
  return out;
}

export function normalizeDemographics(raw: unknown): Demographics | null {
  const first = rec(resultList(raw, "demographics")[0]);
  if (!first) return null;
  const query = rec(first.query) ?? first;
  const age = numberRecord(query.age);
  const gender = numberRecord(query.gender);
  if (!Object.keys(age).length && !Object.keys(gender).length) return null;
  return { age, gender };
}
