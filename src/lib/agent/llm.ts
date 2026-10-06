import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, isStepCount, Output, tool, type LanguageModel } from "ai";
import { z } from "zod";
import { CITIES, REGION_LABELS, citiesIn, findCityByName, normalizeName, type Region } from "../geo/cities";
import { clampStops } from "./request";
import { messageOf, type EncoreToolkit } from "./toolkit";
import type { Baseline, Emit, TourPlan } from "./types";

type Env = Record<string, string | undefined>;

export const DEFAULT_LLM_MODEL = "gemini-flash-latest";

export interface LlmConfig {
  model: LanguageModel;
  id: string;
}

/** Gemini via Google AI Studio when GOOGLE_GENERATIVE_AI_API_KEY is set; otherwise the scripted agent runs. */
export function llmConfig(env: Env = process.env): LlmConfig | null {
  if (env.ENCORE_LLM?.trim().toLowerCase() === "off") return null;
  const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) return null;
  const id = env.ENCORE_LLM_MODEL?.trim() || DEFAULT_LLM_MODEL;
  return { model: createGoogleGenerativeAI({ apiKey })(id), id };
}

const REGIONS = ["north-america", "europe", "latin-america", "asia-pacific"] as const;

const INSTRUCTIONS = `You are Encore, a tour strategist for independent artists, managers and small promoters.
You plan tours with Qloo's cultural taste graph, never from your own assumptions about where an artist is popular.

Work in this order, calling one tool at a time:
1. set_tour_parameters — read the user's brief (artist, region, number of dates, sponsor category).
2. find_artist — resolve the artist in Qloo.
3. map_audience — find which cities over-index for this audience; note hidden markets and big cities to deprioritise.
4. audience_dna — taste tags and demographics of the audience.
5. find_openers — affordable support acts that share the audience.
6. find_sponsors — brand partners (use the category from the brief if any).
7. find_media — podcasts and TV shows for targeted ad buys.
8. scout_city — once for EACH city on the taste route.
Before each tool call, write one short sentence (max 20 words) saying what you are checking and why.
If a tool fails, adapt (e.g. try another spelling) instead of inventing data. When everything is done, reply "DONE".`;

/** Wraps the toolkit as AI SDK tools: the LLM decides the calls, the toolkit does the Qloo work. */
export function buildTools(kit: EncoreToolkit) {
  const safe = async <T>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (error) {
      return { error: messageOf(error) };
    }
  };
  return {
    set_tour_parameters: tool({
      description: "Record the tour parameters parsed from the user's brief.",
      inputSchema: z.object({
        artist: z.string().describe("Artist or band name exactly as written by the user"),
        region: z.enum(REGIONS).describe("Tour region (north-america means a United States tour)"),
        stops: z.number().int().describe("Number of tour dates, 3 to 8"),
        sponsorCategory: z.string().optional().describe("Brand category wanted for sponsorship, e.g. beverage, apparel"),
      }),
      execute: async ({ artist, region, stops, sponsorCategory }) => {
        kit.setRequest({ artist, region: region as Region, stops: clampStops(stops), sponsorCategory });
        kit.step("parse", "done", `${artist} · ${stops} dates · ${REGION_LABELS[region as Region]}`);
        return { ok: true, request: kit.plan.request };
      },
    }),
    find_artist: tool({
      description: "Search Qloo for the artist and return its entity id and popularity.",
      inputSchema: z.object({ name: z.string() }),
      execute: ({ name }) => safe(() => kit.findArtist(name)),
    }),
    map_audience: tool({
      description:
        "Qloo heatmap of the artist's audience across the region's cities. Returns the taste-ranked route, the population-ranked 'obvious' route, hidden markets and cities to deprioritise.",
      inputSchema: z.object({}),
      execute: () => safe(() => kit.mapAudience()),
    }),
    audience_dna: tool({
      description: "Taste tags (genres, lifestyle) and age/gender skew of the artist's audience.",
      inputSchema: z.object({}),
      execute: () => safe(() => kit.audienceDna()),
    }),
    find_openers: tool({
      description: "Less popular artists with high audience affinity: affordable openers who share the crowd.",
      inputSchema: z.object({}),
      execute: () => safe(() => kit.findOpeners()),
    }),
    find_sponsors: tool({
      description: "Brands this audience over-indexes on, optionally restricted to a category.",
      inputSchema: z.object({ category: z.string().optional() }),
      execute: ({ category }) => safe(() => kit.findSponsors(category)),
    }),
    find_media: tool({
      description: "Podcasts and TV shows this audience over-indexes on, for targeted ad buys.",
      inputSchema: z.object({}),
      execute: () => safe(() => kit.findMedia()),
    }),
    scout_city: tool({
      description: "Bars, restaurants and venues in one city with the highest affinity for this audience (after-show, VIP, pop-up).",
      inputSchema: z.object({ city: z.string() }),
      execute: ({ city }) => safe(() => kit.scoutCity(city)),
    }),
  };
}

/** The agent loop: the LLM chooses and sequences the Qloo tools. */
export async function runLlmAgent(kit: EncoreToolkit, llm: LlmConfig, emit: Emit): Promise<void> {
  await generateText({
    model: llm.model,
    instructions: INSTRUCTIONS,
    prompt: `Brief: """${kit.plan.request.brief}"""\n(Heuristic pre-parse, for reference only: ${JSON.stringify({
      artist: kit.plan.request.artist,
      region: kit.plan.request.region,
      stops: kit.plan.request.stops,
      sponsorCategory: kit.plan.request.sponsorCategory,
    })})`,
    tools: buildTools(kit),
    stopWhen: isStepCount(20),
    maxRetries: 1,
    timeout: 45_000,
    onStepEnd: (step) => {
      const text = step.text?.trim();
      if (text && text !== "DONE") emit({ type: "thought", text: text.slice(0, 280) });
    },
  });
}

/** Grounded brief: the LLM only rewrites facts present in the plan and keeps the [Q#] citations. */
export async function writeBriefWithLlm(plan: TourPlan, llm: LlmConfig): Promise<string> {
  const facts = {
    request: plan.request,
    artist: plan.artist && { name: plan.artist.name, popularity: plan.artist.popularity, evidence: plan.artist.evidence },
    audience: plan.audience && {
      tasteRoute: plan.audience.tasteRoute.map((c) => ({ city: c.name, affinity: c.affinity, tasteRank: c.tasteRank, popRank: c.popRank, hidden: c.hidden })),
      deprioritise: plan.audience.cities.filter((c) => plan.audience?.skipped.includes(c.name)).map((c) => ({ city: c.name, affinity: c.affinity })),
      evidence: plan.audience.evidence,
    },
    dna: plan.dna && { tags: plan.dna.tags.slice(0, 8).map((t) => t.name), demographics: plan.dna.demographics, evidence: plan.dna.evidence },
    openers: plan.openers && { items: plan.openers.items.slice(0, 4).map((e) => ({ name: e.name, affinity: e.affinity, popularity: e.popularity, because: e.because })), evidence: plan.openers.evidence },
    sponsors: plan.sponsors && { category: plan.sponsors.category, items: plan.sponsors.items.slice(0, 4).map((e) => ({ name: e.name, affinity: e.affinity })), evidence: plan.sponsors.evidence },
    media: plan.media && { podcasts: plan.media.podcasts.slice(0, 3).map((e) => e.name), shows: plan.media.shows.slice(0, 3).map((e) => e.name), evidence: plan.media.evidence },
    playbook: plan.playbook.map((p) => ({ city: p.city, places: p.places.slice(0, 2).map((x) => ({ name: x.name, kind: x.subtype })), evidence: p.evidence })),
  };
  const { text } = await generateText({
    model: llm.model,
    maxRetries: 1,
    timeout: 30_000,
    instructions:
      "You write concise tour briefs for artist managers. Use ONLY the facts in the JSON. Every bullet that states a Qloo finding ends with its citation in square brackets, e.g. [Q2] or [Q5,Q6], using the evidence numbers given. Markdown only: one '## ' title, '### ' sections, '- ' bullets, **bold**. Max 230 words. End with a '### Caveats' section stating that affinity is an aggregated taste signal, not a ticket forecast.",
    prompt: `Facts:\n${JSON.stringify(facts)}\n\nWrite the brief: route and why, hidden markets, what to deprioritise, audience DNA, opener shortlist, sponsor pitch angle, ad buys, city playbook, caveats.`,
  });
  return text.trim();
}

/** What a generic LLM proposes with no data access: the comparison point for "LLM-only vs Encore". */
export async function llmOnlyProposal(plan: TourPlan, llm: LlmConfig): Promise<RawBaseline> {
  const { request } = plan;
  const pool = citiesIn(request.region).map((c) => c.name);
  const { output } = await generateText({
    model: llm.model,
    maxRetries: 1,
    timeout: 30_000,
    output: Output.object({
      schema: z.object({
        cities: z.array(z.string()).describe("Tour cities"),
        openers: z.array(z.string()).describe("Opening acts"),
        sponsors: z.array(z.string()).describe("Brand sponsors"),
      }),
    }),
    prompt: `Without any external data, plan a ${request.stops}-date ${REGION_LABELS[request.region]} tour for ${request.artist}. Pick exactly ${request.stops} cities from this list: ${pool.join(", ")}. Also suggest 3 opening acts and 3 brand sponsors${request.sponsorCategory ? ` (category: ${request.sponsorCategory})` : ""}.`,
  });
  return {
    source: "llm",
    model: llm.id,
    cities: output.cities.slice(0, request.stops),
    openers: output.openers.slice(0, 3),
    sponsors: output.sponsors.slice(0, 3),
  };
}

/** Without an LLM, the comparison point is the population-ranked "obvious" route. */
export function populationBaseline(plan: TourPlan): Baseline {
  const cities = plan.audience?.obviousRoute.map((c) => c.name) ?? [];
  return scoreBaseline(plan, { source: "population", cities, openers: [], sponsors: [] });
}

export interface RawBaseline {
  source: Baseline["source"];
  model?: string;
  cities: string[];
  openers: string[];
  sponsors: string[];
}

/** Scores any proposed route against the Qloo heatmap of this run. */
export function scoreBaseline(plan: TourPlan, raw: RawBaseline): Baseline {
  const scored = plan.audience?.cities ?? [];
  const cities = raw.cities.map((name) => {
    const city = findCityByName(name) ?? CITIES.find((c) => normalizeName(name).includes(normalizeName(c.name)));
    const s = city && scored.find((c) => c.name === city.name);
    return { name: city?.name ?? name, affinity: s?.affinity, tasteRank: s?.tasteRank };
  });
  const avg = (xs: (number | undefined)[]) => {
    const v = xs.filter((x): x is number => x !== undefined);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
  };
  const baseAvg = avg(cities.map((c) => c.affinity));
  const tasteAvg = avg(plan.audience?.tasteRoute.map((c) => c.affinity) ?? []);
  const lift = baseAvg && tasteAvg ? Math.round(((tasteAvg - baseAvg) / baseAvg) * 100) : undefined;
  const who = raw.source === "llm" ? "The LLM-only plan" : "The population-ranked route";
  const note =
    lift === undefined
      ? `${who} could not be scored against Qloo's heatmap.`
      : `${who} averages ${baseAvg!.toFixed(2)} audience affinity; Encore's taste route averages ${tasteAvg!.toFixed(2)} (${lift >= 0 ? "+" : ""}${lift}%).`;
  return { ...raw, cities, note };
}

