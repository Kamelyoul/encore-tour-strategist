import { REGION_LABELS } from "../geo/cities";
import { createQlooClient } from "../qloo/client";
import type { QlooClient } from "../qloo/types";
import { templateBrief } from "./brief";
import {
  llmConfig,
  llmOnlyProposal,
  populationBaseline,
  scoreBaseline,
  runLlmAgent,
  writeBriefWithLlm,
  type LlmConfig,
} from "./llm";
import { parseBrief } from "./request";
import { EncoreToolkit, messageOf, ToolError } from "./toolkit";
import type { Emit, TourPlan } from "./types";
import type { RawBaseline } from "./llm";

export interface RunOptions {
  client?: QlooClient;
  /** null forces the scripted agent; undefined reads the environment. */
  llm?: LlmConfig | null;
  env?: Record<string, string | undefined>;
}

/**
 * Deterministic agent: same tools, fixed order. Used when no LLM key is configured, and to finish
 * any step the LLM skipped, so the judge always gets a complete, cited plan.
 */
export async function completeMissing(kit: EncoreToolkit, emit: Emit): Promise<void> {
  const say = (text: string) => emit({ type: "thought", text });
  const tryStep = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (error) {
      if (error instanceof ToolError && !kit.plan.artist) throw error;
      emit({ type: "notice", level: "warn", message: `${label}: ${messageOf(error)}` });
    }
  };
  if (!kit.plan.artist) {
    say(`Looking up “${kit.plan.request.artist}” in Qloo's catalogue.`);
    await kit.findArtist(kit.plan.request.artist);
  }
  if (!kit.completed.has("audience")) {
    say(`Asking Qloo where this audience over-indexes across ${REGION_LABELS[kit.plan.request.region]}.`);
    await tryStep("Audience map", () => kit.mapAudience());
  }
  if (!kit.completed.has("dna")) {
    say("Profiling the crowd: taste tags and demographics.");
    await tryStep("Audience DNA", () => kit.audienceDna());
  }
  if (!kit.completed.has("openers")) {
    say("Looking for smaller acts with the same audience: affordable openers.");
    await tryStep("Openers", () => kit.findOpeners());
  }
  if (!kit.completed.has("sponsors")) {
    say(
      kit.plan.request.sponsorCategory
        ? `Ranking ${kit.plan.request.sponsorCategory} brands this audience loves.`
        : "Ranking brands this audience over-indexes on.",
    );
    await tryStep("Sponsors", () => kit.findSponsors());
  }
  if (!kit.completed.has("media")) {
    say("Finding the podcasts and shows this crowd follows, for targeted ad buys.");
    await tryStep("Media", () => kit.findMedia());
  }
  const pending = kit.unscoutedStops();
  if (pending.length) say(`Scouting after-show spots in ${pending.join(", ")}.`);
  for (const city of pending) await tryStep(`Playbook ${city}`, () => kit.scoutCity(city));
}

export async function runEncore(brief: string, emit: Emit, options: RunOptions = {}): Promise<TourPlan> {
  const env = options.env ?? process.env;
  const client = options.client ?? createQlooClient(env);
  const llm = options.llm === undefined ? llmConfig(env) : options.llm;
  const request = parseBrief(brief);
  const kit = new EncoreToolkit(client, request, emit);

  emit({
    type: "meta",
    info: { qloo: client.mode, llm: llm ? { mode: "llm", model: llm.id } : { mode: "scripted" } },
    request,
  });
  if (client.mode === "mock") {
    emit({
      type: "notice",
      level: "info",
      message: "Simulation mode: no Qloo API key configured, so every affinity below is simulated. Set QLOO_API_KEY for live data.",
    });
  }
  kit.step("parse", "running");
  if (!llm) kit.step("parse", "done", `${request.artist} · ${request.stops} dates · ${REGION_LABELS[request.region]}`);
  kit.publish();

  let baselinePromise: Promise<RawBaseline | null> | undefined;
  if (llm) {
    try {
      await runLlmAgent(kit, llm, emit);
    } catch (error) {
      emit({
        type: "notice",
        level: "warn",
        message: `The LLM agent stopped early (${messageOf(error)}); finishing the plan with the scripted agent.`,
      });
    }
    if (!kit.completed.has("parse")) kit.step("parse", "done");
    // Started once the request is final, while the remaining steps run.
    baselinePromise = llmOnlyProposal(kit.plan, llm).catch((error) => {
      emit({ type: "notice", level: "warn", message: `LLM-only baseline unavailable: ${messageOf(error)}` });
      return null;
    });
  }
  await completeMissing(kit, emit);
  kit.step("baseline", "running");

  const proposal = baselinePromise ? await baselinePromise : null;
  const baseline = proposal ? scoreBaseline(kit.plan, proposal) : populationBaseline(kit.plan);
  kit.plan.baseline = baseline;
  kit.step("baseline", "done", baseline.source === "llm" ? "LLM without Qloo" : "Population-ranked route");
  kit.publish();

  kit.step("brief", "running");
  let text: string | undefined;
  if (llm) {
    try {
      text = await writeBriefWithLlm(kit.plan, llm);
    } catch (error) {
      emit({ type: "notice", level: "warn", message: `LLM brief failed (${messageOf(error)}); using the template.` });
    }
  }
  kit.plan.brief = text && text.length > 120 ? text : templateBrief(kit.plan);
  kit.step("brief", "done");
  kit.publish();
  return kit.plan;
}
