"use client";

import { useEffect, useState } from "react";
import type { RunInfo } from "@/lib/agent/types";
import { REGION_LABELS } from "@/lib/geo/cities";
import { AgentFeed, RequestLog } from "./AgentFeed";
import { Markdown } from "./Markdown";
import {
  BaselinePanel,
  DnaPanel,
  MediaPanel,
  OpenersPanel,
  PlaybookPanel,
  RoutePanel,
  SponsorsPanel,
} from "./Panels";
import { TourMap } from "./TourMap";
import { useEncoreRun } from "./useEncoreRun";

const EXAMPLES = [
  "6-date US tour for Khruangbin. Small budget: we need an affordable opener and a drinks sponsor.",
  "5-date European run for Tyler Childers, looking for an apparel partner.",
  "4-date Latin America tour for Fred again.., beverage sponsor wanted.",
  "8-date US tour for Phoebe Bridgers with a beauty brand partner.",
];

function Badge({ label, value, tone }: { label: string; value: string; tone: "live" | "sim" }) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-line bg-ink-2 px-3 py-1 font-mono text-[11px]">
      <span className={`h-1.5 w-1.5 rounded-full ${tone === "live" ? "bg-mint" : "bg-amber"}`} />
      <span className="text-muted">{label}</span>
      <span className="text-cream">{value}</span>
    </span>
  );
}

export function EncoreApp() {
  const { state, run } = useEncoreRun();
  const [brief, setBrief] = useState(EXAMPLES[0]);
  const [status, setStatus] = useState<RunInfo | null>(null);
  const [highlight, setHighlight] = useState<number | undefined>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/status")
      .then((r) => r.json())
      .then((s: RunInfo) => {
        if (alive) setStatus(s);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const info = state.info ?? status;
  const plan = state.plan;
  const region = state.request?.region;
  const running = state.status === "running";
  const started = state.status !== "idle";

  const submit = (text = brief) => {
    const t = text.trim();
    if (t.length < 3 || running) return;
    setBrief(t);
    setHighlight(undefined);
    void run(t);
  };

  const cite = (i: number) => {
    setHighlight(i);
    const item = document.getElementById(`q-${i}`);
    const list = item?.parentElement;
    if (item && list) list.scrollTo({ top: item.offsetTop - list.offsetTop - 8, behavior: "smooth" });
    item?.closest("aside")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const download = () => {
    if (!plan?.brief) return;
    const blob = new Blob([plan.brief], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `encore-${(plan.artist?.name ?? "tour").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    if (!plan?.brief) return;
    try {
      await navigator.clipboard.writeText(plan.brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 py-5">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-4xl uppercase tracking-wider text-amber">Encore</span>
          <span className="hidden text-sm text-muted sm:inline">the tour strategist with taste</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {info && (
            <>
              <Badge label="Qloo" value={info.qloo === "live" ? "live API" : "simulated"} tone={info.qloo === "live" ? "live" : "sim"} />
              <Badge
                label="Agent"
                value={info.llm.mode === "llm" ? (info.llm.model ?? "LLM") : "scripted"}
                tone={info.llm.mode === "llm" ? "live" : "sim"}
              />
            </>
          )}
        </div>
      </header>

      {info?.qloo === "mock" && (
        <p className="mb-4 rounded-lg border border-amber/30 bg-amber/10 px-4 py-2 text-[13px] text-amber">
          Simulation mode — no Qloo API key is configured on this deployment. Artist and brand names are real; every
          affinity, heat value and venue is simulated. Set <code className="font-mono">QLOO_API_KEY</code> to switch to live data.
        </p>
      )}

      <section className={started ? "mb-5" : "py-10 sm:py-16"}>
        {!started && (
          <div className="mb-8 max-w-3xl">
            <p className="eyebrow mb-3">For independent artists, managers & promoters</p>
            <h1 className="font-display text-5xl uppercase leading-[0.95] tracking-wide text-cream sm:text-7xl">
              Route the tour <span className="text-amber">where the taste is.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
              Streaming data shows where people listen. Encore asks Qloo&apos;s taste graph what this audience <em>also</em>{" "}
              loves — then routes the tour to the cities that over-index, picks affordable openers who share the crowd,
              ranks sponsors and ad buys, and scouts after-show spots in every city. Every claim links to the Qloo request
              behind it.
            </p>
          </div>
        )}

        <form
          className="panel flex flex-col gap-3 p-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="flex-1">
            <span className="eyebrow mb-1.5 block px-1">Your brief</span>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              maxLength={400}
              rows={started ? 1 : 2}
              className="w-full resize-none rounded-lg border border-line bg-ink px-3 py-2.5 text-[15px] text-cream outline-none placeholder:text-faint focus:border-amber/60"
              placeholder="e.g. 6-date US tour for Khruangbin, small budget, need an opener and a drinks sponsor"
            />
          </label>
          <button
            type="submit"
            disabled={running}
            className="h-12 shrink-0 rounded-lg bg-amber px-6 font-display text-lg uppercase tracking-wider text-ink transition hover:bg-amber-deep disabled:cursor-wait disabled:opacity-60"
          >
            {running ? "Planning…" : "Plan the tour"}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              disabled={running}
              onClick={() => submit(ex)}
              className="rounded-full border border-line px-3 py-1 text-left text-[12px] text-muted transition hover:border-amber/50 hover:text-cream disabled:opacity-50"
            >
              {ex.length > 60 ? `${ex.slice(0, 58)}…` : ex}
            </button>
          ))}
        </div>
      </section>

      {state.status === "error" && (
        <p className="mb-5 rounded-lg border border-coral/40 bg-coral/10 px-4 py-3 text-sm text-coral">{state.error}</p>
      )}

      {started && (
        <>
          <div className="grid gap-5 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-2xl uppercase tracking-wide">
                  {plan?.artist?.name ?? state.request?.artist ?? "…"}
                  {state.request && (
                    <span className="ml-3 font-sans text-sm normal-case tracking-normal text-muted">
                      {state.request.stops} dates · {REGION_LABELS[state.request.region]}
                      {state.request.sponsorCategory ? ` · ${state.request.sponsorCategory} sponsor` : ""}
                    </span>
                  )}
                </h2>
                {state.status === "done" && (
                  <span className="font-mono text-[11px] text-faint">
                    {state.replayed ? "replayed from cache" : `planned in ${((state.ms ?? 0) / 1000).toFixed(1)}s`} ·{" "}
                    {state.requests.length} Qloo calls
                  </span>
                )}
              </div>
              <TourMap
                region={region}
                usOnly={region === "north-america"}
                audience={plan?.audience}
                scanning={running && !plan?.audience}
              />
            </div>
            <aside className="panel flex flex-col gap-5 p-4 lg:col-span-4">
              <div>
                <p className="eyebrow mb-2">Agent</p>
                <AgentFeed feed={state.feed} running={running} />
              </div>
              <RequestLog requests={state.requests} highlight={highlight} onSelect={setHighlight} />
            </aside>
          </div>

          {plan && (
            <div className="mt-5 grid gap-5 lg:grid-cols-12">
              {plan.brief && (
                <section className="panel fade-up p-6 lg:col-span-12">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="eyebrow">Tour brief · every claim cites its Qloo request</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={copy} className="rounded-md border border-line px-3 py-1 text-[12px] text-muted hover:text-cream">
                        {copied ? "Copied" : "Copy"}
                      </button>
                      <button type="button" onClick={download} className="rounded-md border border-line px-3 py-1 text-[12px] text-muted hover:text-cream">
                        Download .md
                      </button>
                    </div>
                  </div>
                  <div className="max-w-4xl">
                    <Markdown text={plan.brief} onCite={cite} />
                  </div>
                </section>
              )}
              <div className="lg:col-span-7">
                <RoutePanel plan={plan} onCite={cite} />
              </div>
              <div className="lg:col-span-5">
                <BaselinePanel plan={plan} onCite={cite} />
              </div>
              <div className="lg:col-span-6">
                <DnaPanel plan={plan} onCite={cite} />
              </div>
              <div className="lg:col-span-6">
                <OpenersPanel plan={plan} onCite={cite} />
              </div>
              <div className="lg:col-span-5">
                <SponsorsPanel plan={plan} onCite={cite} />
              </div>
              <div className="lg:col-span-7">
                <MediaPanel plan={plan} onCite={cite} />
              </div>
              <div className="lg:col-span-12">
                <PlaybookPanel plan={plan} onCite={cite} />
              </div>
            </div>
          )}
        </>
      )}

      <footer className="mt-14 border-t border-line pt-5 text-[12px] leading-relaxed text-faint">
        Built for the Qloo Agentic Hackathon. Taste data: Qloo Insights API{info?.qloo === "mock" ? " (simulated on this deployment)" : ""}.
        Affinity scores are aggregated, anonymous taste signals — not ticket-sales forecasts. Encore only sends public artist
        names to Qloo, never personal data.
      </footer>
    </div>
  );
}
