import { describe, expect, it } from "vitest";
import { createQlooClient, qlooMode } from "../qloo/client";
import { LiveQlooClient, clearQlooCache, insightsQuery } from "../qloo/live";
import { MockQlooClient } from "../qloo/mock";
import { buildQueryString, decodeGeohash, normalizeEntity, normalizeHeatPoint } from "../qloo/parse";

describe("parse", () => {
  it("joins arrays with commas and drops empty values", () => {
    expect(buildQueryString({ a: ["x", "y"], b: undefined, c: "", d: 2, e: true })).toBe("a=x%2Cy&d=2&e=true");
  });

  it("decodes a geohash near its true location", () => {
    const p = decodeGeohash("9v6kp")!; // Austin, TX
    expect(Math.abs(p.latitude - 30.27)).toBeLessThan(0.3);
    expect(Math.abs(p.longitude + 97.74)).toBeLessThan(0.3);
  });

  it("normalises an insights entity with explainability", () => {
    const e = normalizeEntity({
      entity_id: "ABC",
      name: "Hermanos Gutiérrez",
      types: ["urn:entity:artist"],
      popularity: 0.71,
      properties: { short_description: "Swiss-Ecuadorian guitar duo" },
      query: {
        affinity: 0.93,
        explainability: { "signal.interests.entities": [{ entity_id: "K1", name: "Khruangbin", score: 0.9 }] },
      },
      tags: [{ id: "urn:tag:genre:music:psychedelic", name: "Psychedelic" }],
    })!;
    expect(e).toMatchObject({ id: "ABC", type: "urn:entity:artist", affinity: 0.93, because: ["Khruangbin"] });
    expect(e.tags[0].name).toBe("Psychedelic");
  });

  it("reads heatmap cells given as geohash", () => {
    const p = normalizeHeatPoint({ location: { geohash: "9v6kp" }, query: { affinity: 0.8, popularity: 0.4 } })!;
    expect(p.affinity).toBe(0.8);
    expect(p.latitude).toBeGreaterThan(29);
  });
});

describe("client selection", () => {
  it("uses mock without a key and live with one", () => {
    expect(qlooMode({})).toBe("mock");
    expect(qlooMode({ QLOO_API_KEY: "k" })).toBe("live");
    expect(qlooMode({ QLOO_API_KEY: "k", QLOO_MODE: "mock" })).toBe("mock");
    expect(createQlooClient({ QLOO_API_KEY: "k" }).mode).toBe("live");
    expect(() => createQlooClient({ QLOO_MODE: "live" })).toThrow(/QLOO_API_KEY/);
  });
});

describe("LiveQlooClient", () => {
  it("sends GET with X-Api-Key to the hackathon host, caches, and never logs the key", async () => {
    clearQlooCache();
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return new Response(
        JSON.stringify({ results: [{ entity_id: "E1", name: "Khruangbin", types: ["urn:entity:artist"] }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const client = new LiveQlooClient({ apiKey: "secret-key", fetchImpl });
    const first = await client.search("Khruangbin", ["urn:entity:artist"], 3);
    await client.search("Khruangbin", ["urn:entity:artist"], 3);
    expect(first[0].id).toBe("E1");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://hackathon.api.qloo.com/search?query=Khruangbin&types=urn%3Aentity%3Aartist&take=3",
    );
    expect(calls[0].headers["X-Api-Key"]).toBe("secret-key");
    expect(client.log.map((r) => r.cached)).toEqual([false, true]);
    expect(JSON.stringify(client.log)).not.toContain("secret-key");
  });

  it("retries 429 then succeeds", async () => {
    clearQlooCache();
    let n = 0;
    const fetchImpl = (async () => {
      n += 1;
      return n === 1
        ? new Response(JSON.stringify({ message: "slow down" }), { status: 429 })
        : new Response(JSON.stringify({ results: { tags: [{ id: "urn:tag:x", name: "X" }] } }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new LiveQlooClient({ apiKey: "k", fetchImpl, sleep: async () => {} });
    const tags = await client.findTags("beverage");
    expect(n).toBe(2);
    expect(tags[0].id).toBe("urn:tag:x");
  });

  it("maps insights params to Qloo's dotted query names", () => {
    const qs = buildQueryString(
      insightsQuery({
        filterType: "urn:entity:place",
        signalEntities: ["A"],
        filterLocationQuery: "Austin",
        popularityMax: 0.5,
        take: 5,
        explain: true,
      }),
    );
    expect(qs).toContain("filter.type=urn%3Aentity%3Aplace");
    expect(qs).toContain("signal.interests.entities=A");
    expect(qs).toContain("filter.location.query=Austin");
    expect(qs).toContain("filter.popularity.max=0.5");
    expect(qs).toContain("feature.explainability=true");
  });
});

describe("MockQlooClient", () => {
  it("is deterministic and synthesises unknown artists", async () => {
    const a = new MockQlooClient();
    const b = new MockQlooClient();
    const [ka] = await a.search("khruangbin", ["urn:entity:artist"]);
    const [kb] = await b.search("khruangbin", ["urn:entity:artist"]);
    expect(ka.name).toBe("Khruangbin");
    const ra = await a.insightsEntities({ filterType: "urn:entity:artist", signalEntities: [ka.id], take: 5 });
    const rb = await b.insightsEntities({ filterType: "urn:entity:artist", signalEntities: [kb.id], take: 5 });
    expect(ra.map((e) => e.name)).toEqual(rb.map((e) => e.name));
    expect(ra.find((e) => e.id === ka.id)).toBeUndefined();
    const [unknown] = await a.search("The Totally Unknown Band", ["urn:entity:artist"]);
    expect(unknown.name).toBe("The Totally Unknown Band");
    expect(a.log.every((r) => r.status === "ok")).toBe(true);
  });
});
