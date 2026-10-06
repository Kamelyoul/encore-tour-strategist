import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { parseBrief } from "../agent/request";
import { runEncore } from "../agent/run";
import type { AgentEvent } from "../agent/types";
import { MockQlooClient } from "../qloo/mock";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

function result(
  content: LanguageModelV4GenerateResult["content"],
  unified: "stop" | "tool-calls",
): LanguageModelV4GenerateResult {
  return { content, finishReason: { unified, raw: unified }, usage, warnings: [] } as LanguageModelV4GenerateResult;
}

describe("parseBrief", () => {
  it("extracts artist, stops, region and sponsor category", () => {
    expect(
      parseBrief("6-date US tour for Khruangbin. Small budget: we need an opener and a drinks sponsor."),
    ).toMatchObject({ artist: "Khruangbin", stops: 6, region: "north-america", sponsorCategory: "beverage" });
    expect(parseBrief("Five-show European run for Fred again.., apparel partner wanted")).toMatchObject({
      artist: "Fred again..",
      stops: 5,
      region: "europe",
      sponsorCategory: "apparel",
    });
    expect(parseBrief("Plan a 20 city tour for Nova Twins in Europe")).toMatchObject({
      artist: "Nova Twins",
      stops: 8,
      region: "europe",
    });
  });
});

describe("runEncore (scripted agent, simulated Qloo)", () => {
  it("produces a complete, cited plan", async () => {
    const events: AgentEvent[] = [];
    const plan = await runEncore(
      "6-date US tour for Khruangbin. Small budget: we need an affordable opener and a drinks sponsor.",
      (e) => events.push(e),
      { client: new MockQlooClient(), llm: null },
    );
    expect(plan.artist?.name).toBe("Khruangbin");
    expect(plan.audience?.tasteRoute).toHaveLength(6);
    expect(plan.audience?.obviousRoute).toHaveLength(6);
    expect(plan.audience?.hiddenMarkets.length).toBeGreaterThan(0);
    expect(plan.openers?.items.length).toBeGreaterThan(0);
    expect(plan.openers?.items.every((o) => (o.popularity ?? 0) <= plan.openers!.maxPopularity)).toBe(true);
    expect(plan.sponsors?.category).toBe("Beverages");
    expect(plan.media?.podcasts.length).toBeGreaterThan(0);
    expect(plan.playbook.map((p) => p.city).sort()).toEqual(plan.audience!.tasteRoute.map((c) => c.name).sort());
    expect(plan.baseline?.source).toBe("population");
    expect(plan.brief).toMatch(/\[Q\d/);

    const qloo = events.filter((e): e is Extract<AgentEvent, { type: "qloo" }> => e.type === "qloo");
    expect(qloo.map((e) => e.index)).toEqual(qloo.map((_, i) => i + 1));
    const kinds = new Set(qloo.map((e) => `${e.record.path} ${e.record.params["filter.type"] ?? ""}`.trim()));
    // search, tags, heatmap, tag insights, demographics, artist/brand/podcast/tv/place insights
    expect(kinds.size).toBeGreaterThanOrEqual(10);
    expect(events.find((e) => e.type === "meta")).toMatchObject({ info: { qloo: "mock", llm: { mode: "scripted" } } });
  });
});

describe("runEncore (LLM agent)", () => {
  it("lets the LLM drive the tools, then completes and writes a grounded brief", async () => {
    let agentStep = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        if (options.tools?.length) {
          agentStep += 1;
          const call = (toolName: string, input: object) => ({
            type: "tool-call" as const,
            toolCallId: `c${agentStep}`,
            toolName,
            input: JSON.stringify(input),
          });
          if (agentStep === 1)
            return result(
              [
                { type: "text", text: "Reading the brief." },
                call("set_tour_parameters", { artist: "Tyler Childers", region: "europe", stops: 4 }),
              ],
              "tool-calls",
            );
          if (agentStep === 2) return result([call("find_artist", { name: "Tyler Childers" })], "tool-calls");
          if (agentStep === 3) return result([call("map_audience", {})], "tool-calls");
          return result([{ type: "text", text: "DONE" }], "stop");
        }
        if (options.responseFormat?.type === "json") {
          return result(
            [
              {
                type: "text",
                text: JSON.stringify({ cities: ["London", "Paris", "Berlin", "Madrid"], openers: ["A"], sponsors: ["B"] }),
              },
            ],
            "stop",
          );
        }
        return result([{ type: "text", text: "## Brief\n" + "- Route grounded in Qloo heatmap [Q2]\n".repeat(6) }], "stop");
      },
    });
    const events: AgentEvent[] = [];
    const plan = await runEncore("Tour for Tyler Childers please", (e) => events.push(e), {
      client: new MockQlooClient(),
      llm: { model, id: "mock-llm" },
    });
    expect(plan.request).toMatchObject({ artist: "Tyler Childers", region: "europe", stops: 4 });
    expect(plan.audience?.tasteRoute).toHaveLength(4);
    expect(plan.playbook).toHaveLength(4);
    expect(plan.baseline?.source).toBe("llm");
    expect(plan.baseline?.cities.map((c) => c.name)).toEqual(["London", "Paris", "Berlin", "Madrid"]);
    expect(plan.brief).toContain("[Q2]");
    expect(events.some((e) => e.type === "thought" && e.text === "Reading the brief.")).toBe(true);
  });

  it("falls back to the scripted agent when the LLM fails", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("quota exceeded");
      },
    });
    const events: AgentEvent[] = [];
    const plan = await runEncore("4-date Latin America tour for Bad Bunny", (e) => events.push(e), {
      client: new MockQlooClient(),
      llm: { model, id: "broken" },
    });
    expect(plan.audience?.tasteRoute).toHaveLength(4);
    expect(plan.baseline?.source).toBe("population");
    expect(plan.brief).toMatch(/\[Q\d/);
    expect(events.some((e) => e.type === "notice" && e.level === "warn")).toBe(true);
  });
});
