import {
  REGION_LABELS,
  REGION_LOCATION_QUERY,
  citiesIn,
  findCityByName,
  haversineKm,
  nearestCity,
  type City,
} from "../geo/cities";
import { QlooError, type QlooClient, type QlooEntity } from "../qloo/types";
import type {
  AudienceMap,
  CityScore,
  Emit,
  Evidence,
  RouteStop,
  StepId,
  TourPlan,
  TourRequest,
} from "./types";

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

const STEP_LABELS: Record<StepId, string> = {
  parse: "Reading the brief",
  artist: "Finding the artist in Qloo",
  audience: "Mapping where the audience lives",
  dna: "Profiling the audience's taste DNA",
  openers: "Scouting affordable openers",
  sponsors: "Ranking brand partners",
  media: "Finding podcasts & shows for ad buys",
  playbook: "Scouting after-show spots per city",
  baseline: "Benchmarking against a plan without Qloo",
  brief: "Writing the tour brief",
};

export const round2 = (x: number | undefined) => (x === undefined ? undefined : Math.round(x * 100) / 100);
export const q = (evidence: Evidence) => evidence.map((i) => `Q${i}`).join(",");

export function routeKm(route: { lat: number; lon: number }[]): number {
  let km = 0;
  for (let i = 1; i < route.length; i += 1) km += haversineKm(route[i - 1], route[i]);
  return km;
}

/**
 * Orders stops into a short open path: nearest-neighbour from the westernmost city, then 2-opt
 * (reverse any segment that shortens the drive). Exact enough for 3–8 stops.
 */
export function orderRoute<T extends { lat: number; lon: number }>(stops: T[]): T[] {
  if (stops.length <= 2) return [...stops];
  const remaining = [...stops].sort((a, b) => a.lon - b.lon);
  let route = [remaining.shift()!];
  while (remaining.length) {
    const last = route[route.length - 1];
    let best = 0;
    for (let i = 1; i < remaining.length; i += 1) {
      if (haversineKm(last, remaining[i]) < haversineKm(last, remaining[best])) best = i;
    }
    route.push(remaining.splice(best, 1)[0]);
  }
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < route.length - 1; i += 1) {
      for (let j = i + 1; j < route.length; j += 1) {
        const candidate = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)];
        if (routeKm(candidate) + 1e-6 < routeKm(route)) {
          route = candidate;
          improved = true;
        }
      }
    }
  }
  return route[0].lon <= route[route.length - 1].lon ? route : route.reverse();
}

/**
 * The agent's tools. Each one calls Qloo, records which requests back it (evidence), updates the
 * shared plan and emits progress events. Calls are serialised so provenance stays exact even when
 * the LLM issues parallel tool calls (and the hackathon quota is spared).
 */
export class EncoreToolkit {
  readonly plan: TourPlan;
  private emitted = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly started = new Set<StepId>();
  readonly completed = new Set<StepId>();

  constructor(
    readonly client: QlooClient,
    request: TourRequest,
    private readonly emit: Emit,
  ) {
    this.plan = { request, playbook: [] };
  }

  setRequest(patch: Partial<TourRequest>) {
    Object.assign(this.plan.request, patch);
    this.publish();
  }

  publish() {
    this.emit({ type: "plan", plan: structuredClone(this.plan) });
  }

  step(id: StepId, status: "running" | "done" | "error", detail?: string) {
    if (status === "running") {
      if (this.started.has(id) && id !== "playbook") return;
      this.started.add(id);
    }
    if (status === "done") this.completed.add(id);
    this.emit({ type: "step", id, label: STEP_LABELS[id], status, detail });
  }

  private flush(): void {
    const log = this.client.log;
    while (this.emitted < log.length) {
      this.emit({ type: "qloo", index: this.emitted + 1, record: log[this.emitted] });
      this.emitted += 1;
    }
  }

  /** Runs `fn` exclusively and returns the 1-based log indices of the Qloo requests it made. */
  private exclusive<T>(fn: () => Promise<T>): Promise<{ result: T; evidence: Evidence }> {
    const run = async () => {
      const start = this.client.log.length;
      try {
        const result = await fn();
        return { result, evidence: this.indices(start) };
      } finally {
        this.flush();
      }
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private indices(start: number): Evidence {
    const out: Evidence = [];
    for (let i = start; i < this.client.log.length; i += 1) out.push(i + 1);
    return out;
  }

  private requireArtist(): QlooEntity {
    if (!this.plan.artist) throw new ToolError("Call find_artist first.");
    return this.plan.artist;
  }

  private async guarded<T>(id: StepId, fn: () => Promise<T>): Promise<T> {
    this.step(id, "running");
    try {
      const result = await fn();
      this.step(id, "done");
      this.publish();
      return result;
    } catch (error) {
      this.step(id, "error", messageOf(error));
      throw error;
    }
  }

  // ---------------------------------------------------------------- tools

  async findArtist(name: string) {
    return this.guarded("artist", async () => {
      const { result, evidence } = await this.exclusive(() =>
        this.client.search(name, ["urn:entity:artist"], 5),
      );
      const artist = result[0];
      if (!artist) throw new ToolError(`No artist named "${name}" in Qloo.`);
      this.plan.artist = { ...artist, evidence };
      this.plan.request.artist = artist.name;
      return {
        evidence: q(evidence),
        artist: { id: artist.id, name: artist.name, popularity: round2(artist.popularity) },
        alternatives: result.slice(1, 4).map((e) => e.name),
      };
    });
  }

  async mapAudience() {
    return this.guarded("audience", async () => {
      const artist = this.requireArtist();
      const { region, stops } = this.plan.request;
      const locationQuery = REGION_LOCATION_QUERY[region];
      // A heatmap scoped to the United States has no signal for Canadian cities: keep the pool consistent.
      const pool = citiesIn(region).filter((c) => locationQuery !== "United States" || c.country === "US");
      const { result: heat, evidence } = await this.exclusive(() =>
        this.client.heatmap(artist.id, locationQuery, 50),
      );
      const best = new Map<string, number>();
      const dots: AudienceMap["dots"] = [];
      for (const p of heat) {
        const point = { lat: p.latitude, lon: p.longitude };
        const city = nearestCity(point, 80, pool);
        if (city) best.set(city.name, Math.max(best.get(city.name) ?? 0, p.affinity));
        if (city || nearestCity(point, 400, pool)) dots.push({ ...point, affinity: p.affinity });
      }
      const byPop = [...pool].sort((a, b) => b.pop - a.pop);
      const scored = byPop
        .map((c, i): CityScore => ({ ...cityFields(c), affinity: best.get(c.name), popRank: i + 1 }))
        .filter((c) => c.affinity !== undefined)
        .sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0))
        .map((c, i) => ({ ...c, tasteRank: i + 1 }));
      const unscored = byPop
        .filter((c) => !best.has(c.name))
        .map((c): CityScore => ({ ...cityFields(c), popRank: byPop.indexOf(c) + 1 }));
      const cities = [...scored, ...unscored];
      const obviousRoute = cities.filter((c) => c.popRank <= stops).sort((a, b) => a.popRank - b.popRank);
      const obviousNames = new Set(obviousRoute.map((c) => c.name));
      let picks: CityScore[] = scored.slice(0, stops);
      if (picks.length < stops) {
        picks = [...picks, ...unscored.slice(0, stops - picks.length)];
        this.emit({
          type: "notice",
          level: "warn",
          message: `Qloo returned taste signal for only ${scored.length} reference cities in ${REGION_LABELS[region]}; the remaining stops fall back to population.`,
        });
      }
      const tasteRoute: RouteStop[] = orderRoute(picks).map((c) => ({ ...c, hidden: !obviousNames.has(c.name) }));
      const tasteNames = new Set(tasteRoute.map((c) => c.name));
      this.plan.audience = {
        cities,
        tasteRoute,
        obviousRoute,
        hiddenMarkets: tasteRoute.filter((c) => c.hidden).map((c) => c.name),
        skipped: obviousRoute.filter((c) => !tasteNames.has(c.name)).map((c) => c.name),
        dots: dots.slice(0, 150),
        evidence,
      };
      const a = this.plan.audience;
      return {
        evidence: q(evidence),
        region: REGION_LABELS[region],
        tasteRoute: tasteRoute.map((c) => ({
          city: c.name,
          affinity: round2(c.affinity),
          tasteRank: c.tasteRank,
          populationRank: c.popRank,
          hiddenMarket: c.hidden,
        })),
        obviousRouteByPopulation: obviousRoute.map((c) => ({ city: c.name, affinity: round2(c.affinity) })),
        hiddenMarkets: a.hiddenMarkets,
        deprioritise: a.skipped,
      };
    });
  }

  async audienceDna() {
    return this.guarded("dna", async () => {
      const artist = this.requireArtist();
      const { result: tags, evidence: e1 } = await this.exclusive(() => this.client.insightsTags([artist.id], 12));
      let demographics = null;
      let e2: Evidence = [];
      try {
        const r = await this.exclusive(() => this.client.demographics([artist.id]));
        demographics = r.result;
        e2 = r.evidence;
      } catch (error) {
        this.emit({ type: "notice", level: "warn", message: `Demographics unavailable: ${messageOf(error)}` });
      }
      this.plan.dna = { tags, demographics, evidence: [...e1, ...e2] };
      return {
        evidence: q([...e1, ...e2]),
        tasteTags: tags.slice(0, 10).map((t) => ({ tag: t.name, affinity: round2(t.affinity) })),
        demographics,
      };
    });
  }

  async findOpeners() {
    return this.guarded("openers", async () => {
      const artist = this.requireArtist();
      const maxPopularity = Math.max(0.25, Math.min(0.9, (artist.popularity ?? 0.8) - 0.12));
      const base = { filterType: "urn:entity:artist" as const, signalEntities: [artist.id], excludeEntities: [artist.id], take: 8, explain: true };
      let { result, evidence } = await this.exclusive(() =>
        this.client.insightsEntities({ ...base, popularityMax: round2(maxPopularity) }),
      );
      if (!result.length) {
        const retry = await this.exclusive(() => this.client.insightsEntities(base));
        result = retry.result;
        evidence = [...evidence, ...retry.evidence];
      }
      const items = result.filter((e) => e.id !== artist.id);
      this.plan.openers = { items, maxPopularity: round2(maxPopularity) ?? maxPopularity, evidence };
      return {
        evidence: q(evidence),
        maxPopularity: round2(maxPopularity),
        openers: items.map((e) => ({
          name: e.name,
          affinity: round2(e.affinity),
          popularity: round2(e.popularity),
          because: e.because,
        })),
      };
    });
  }

  async findSponsors(category?: string) {
    return this.guarded("sponsors", async () => {
      const artist = this.requireArtist();
      const wanted = category?.trim() || this.plan.request.sponsorCategory;
      let evidence: Evidence = [];
      let filterTags: string[] | undefined;
      let categoryLabel: string | undefined;
      if (wanted) {
        const tags = await this.exclusive(() => this.client.findTags(wanted, 5));
        evidence = tags.evidence;
        const tag = tags.result.find((t) => /category|brand/.test(t.id)) ?? tags.result[0];
        if (tag) {
          filterTags = [tag.id];
          categoryLabel = tag.name;
        }
      }
      const base = { filterType: "urn:entity:brand" as const, signalEntities: [artist.id], take: 8, explain: true };
      let r = await this.exclusive(() => this.client.insightsEntities({ ...base, filterTags }));
      evidence = [...evidence, ...r.evidence];
      if (!r.result.length && filterTags) {
        r = await this.exclusive(() => this.client.insightsEntities(base));
        evidence = [...evidence, ...r.evidence];
        categoryLabel = undefined;
      }
      this.plan.sponsors = { items: r.result, category: categoryLabel, evidence };
      return {
        evidence: q(evidence),
        category: categoryLabel ?? "any",
        brands: r.result.map((e) => ({ name: e.name, affinity: round2(e.affinity), popularity: round2(e.popularity) })),
      };
    });
  }

  async findMedia() {
    return this.guarded("media", async () => {
      const artist = this.requireArtist();
      const p = await this.exclusive(() =>
        this.client.insightsEntities({ filterType: "urn:entity:podcast", signalEntities: [artist.id], take: 6 }),
      );
      const s = await this.exclusive(() =>
        this.client.insightsEntities({ filterType: "urn:entity:tv_show", signalEntities: [artist.id], take: 6 }),
      );
      const evidence = [...p.evidence, ...s.evidence];
      this.plan.media = { podcasts: p.result, shows: s.result, evidence };
      return {
        evidence: q(evidence),
        podcasts: p.result.map((e) => ({ name: e.name, affinity: round2(e.affinity) })),
        tvShows: s.result.map((e) => ({ name: e.name, affinity: round2(e.affinity) })),
      };
    });
  }

  async scoutCity(cityName: string) {
    return this.guarded("playbook", async () => {
      const artist = this.requireArtist();
      const city = findCityByName(cityName)?.name ?? cityName.trim();
      const { result, evidence } = await this.exclusive(() =>
        this.client.insightsEntities({
          filterType: "urn:entity:place",
          signalEntities: [artist.id],
          filterLocationQuery: city,
          take: 5,
        }),
      );
      const entry = { city, places: result, evidence };
      const i = this.plan.playbook.findIndex((p) => p.city === city);
      if (i >= 0) this.plan.playbook[i] = entry;
      else this.plan.playbook.push(entry);
      return {
        evidence: q(evidence),
        city,
        places: result.map((e) => ({ name: e.name, kind: e.subtype ?? e.tags[0]?.name, affinity: round2(e.affinity) })),
      };
    });
  }

  /** Cities on the taste route that have not been scouted yet. */
  unscoutedStops(): string[] {
    const done = new Set(this.plan.playbook.map((p) => p.city));
    return (this.plan.audience?.tasteRoute ?? []).map((c) => c.name).filter((n) => !done.has(n));
  }
}

function cityFields(c: City) {
  return { name: c.name, country: c.country, lat: c.lat, lon: c.lon, pop: c.pop };
}

export function messageOf(error: unknown): string {
  if (error instanceof QlooError || error instanceof ToolError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
