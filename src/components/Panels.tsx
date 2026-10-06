"use client";

import type { ReactNode } from "react";
import { ageLabel } from "@/lib/agent/brief";
import type { Evidence, TourPlan } from "@/lib/agent/types";
import type { QlooEntity } from "@/lib/qloo/types";

type OnCite = (index: number) => void;

export function Cite({ evidence, onCite }: { evidence?: Evidence; onCite: OnCite }) {
  if (!evidence?.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {evidence.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onCite(id)}
          className="rounded border border-amber/40 bg-amber/10 px-1 font-mono text-[10px] text-amber hover:bg-amber/25"
          title="Show the Qloo request"
        >
          Q{id}
        </button>
      ))}
    </span>
  );
}

export function Panel({
  title,
  kicker,
  evidence,
  onCite,
  children,
  className = "",
}: {
  title: string;
  kicker?: string;
  evidence?: Evidence;
  onCite: OnCite;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel fade-up p-5 ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          {kicker && <p className="eyebrow mb-1">{kicker}</p>}
          <h3 className="font-display text-2xl uppercase tracking-wide text-cream">{title}</h3>
        </div>
        <Cite evidence={evidence} onCite={onCite} />
      </header>
      {children}
    </section>
  );
}

export function Bar({ value, tone = "amber" }: { value?: number; tone?: "amber" | "slate" | "coral" }) {
  const pct = Math.round(Math.max(0, Math.min(1, value ?? 0)) * 100);
  const color = tone === "amber" ? "bg-amber" : tone === "coral" ? "bg-coral" : "bg-slate";
  return (
    <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-ink-3">
      <span className={`absolute inset-y-0 left-0 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

const num = (x?: number) => (x === undefined ? "—" : x.toFixed(2));

function avg(xs: (number | undefined)[]) {
  const v = xs.filter((x): x is number => x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
}

export function RoutePanel({ plan, onCite }: { plan: TourPlan; onCite: OnCite }) {
  const a = plan.audience;
  if (!a) return null;
  const tasteAvg = avg(a.tasteRoute.map((c) => c.affinity));
  const obvAvg = avg(a.obviousRoute.map((c) => c.affinity));
  const lift = tasteAvg && obvAvg ? Math.round(((tasteAvg - obvAvg) / obvAvg) * 100) : undefined;
  return (
    <Panel title="Taste route vs obvious route" kicker="Where the audience actually is" evidence={a.evidence} onCite={onCite}>
      <div className="mb-4 grid grid-cols-3 gap-3 text-center">
        <Stat label="Taste route affinity" value={num(tasteAvg)} accent />
        <Stat label="Obvious route affinity" value={num(obvAvg)} />
        <Stat label="Audience-fit lift" value={lift === undefined ? "—" : `${lift >= 0 ? "+" : ""}${lift}%`} accent />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <p className="eyebrow mb-2 !text-amber">Encore · ranked by Qloo affinity</p>
          <ol className="space-y-2">
            {a.tasteRoute.map((c, i) => (
              <li key={c.name} className="grid grid-cols-[1.5rem_1fr_3rem] items-center gap-2 text-sm">
                <span className="font-mono text-amber">{i + 1}</span>
                <span>
                  <span className="flex items-center gap-2">
                    {c.name}
                    {c.hidden && (
                      <span className="rounded bg-amber px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-wider text-ink">
                        hidden market
                      </span>
                    )}
                  </span>
                  <Bar value={c.affinity} />
                </span>
                <span className="text-right font-mono text-xs text-muted">{num(c.affinity)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="eyebrow mb-2 !text-slate">Obvious · biggest metros</p>
          <ol className="space-y-2">
            {a.obviousRoute.map((c, i) => (
              <li key={c.name} className="grid grid-cols-[1.5rem_1fr_3rem] items-center gap-2 text-sm">
                <span className="font-mono text-slate">{i + 1}</span>
                <span>
                  <span className="flex items-center gap-2 text-cream/80">
                    {c.name}
                    {a.skipped.includes(c.name) && (
                      <span className="rounded border border-slate/50 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-slate">
                        deprioritise
                      </span>
                    )}
                  </span>
                  <Bar value={c.affinity} tone="slate" />
                </span>
                <span className="text-right font-mono text-xs text-muted">{num(c.affinity)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Panel>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-ink/60 px-2 py-3">
      <p className={`font-display text-3xl ${accent ? "text-amber" : "text-slate"}`}>{value}</p>
      <p className="mt-1 text-[11px] leading-tight text-muted">{label}</p>
    </div>
  );
}

export function DnaPanel({ plan, onCite }: { plan: TourPlan; onCite: OnCite }) {
  const dna = plan.dna;
  if (!dna) return null;
  const max = Math.max(...dna.tags.map((t) => t.affinity ?? 0), 0.01);
  return (
    <Panel title="Audience DNA" kicker="Who buys the ticket" evidence={dna.evidence} onCite={onCite}>
      <div className="mb-5 flex flex-wrap gap-2">
        {dna.tags.slice(0, 12).map((t) => {
          const w = (t.affinity ?? 0) / max;
          return (
            <span
              key={t.id}
              className="rounded-full border border-coral/30 px-3 py-1 text-cream"
              style={{ fontSize: `${12 + w * 5}px`, background: `rgba(255,93,93,${0.05 + w * 0.2})` }}
            >
              {t.name}
            </span>
          );
        })}
      </div>
      {dna.demographics && (
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <div>
            <p className="eyebrow mb-2">Age skew vs. average</p>
            <Diverging values={Object.entries(dna.demographics.age).map(([k, v]) => [ageLabel(k), v])} />
          </div>
          <div>
            <p className="eyebrow mb-2">Gender skew</p>
            <Diverging values={Object.entries(dna.demographics.gender)} />
          </div>
        </div>
      )}
    </Panel>
  );
}

function Diverging({ values }: { values: [string, number][] }) {
  const max = Math.max(...values.map(([, v]) => Math.abs(v)), 0.01);
  return (
    <div className="space-y-1.5">
      {values.map(([k, v]) => {
        const pct = (Math.abs(v) / max) * 50;
        return (
          <div key={k} className="grid grid-cols-[5.5rem_1fr] items-center gap-2 text-[12px]">
            <span className="text-muted">{k}</span>
            <span className="relative h-2.5 rounded bg-ink-3">
              <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
              <span
                className={`absolute inset-y-0 rounded ${v >= 0 ? "bg-coral" : "bg-slate/60"}`}
                style={v >= 0 ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EntityRow({ e, extra, tone }: { e: QlooEntity; extra?: ReactNode; tone?: "amber" | "coral" | "slate" }) {
  return (
    <li className="grid grid-cols-[1fr_3rem] items-center gap-x-3 gap-y-1 text-sm">
      <span className="min-w-0">
        <span className="block truncate text-cream">{e.name}</span>
        {extra}
      </span>
      <span className="row-span-2 text-right font-mono text-xs text-muted">{num(e.affinity)}</span>
      <Bar value={e.affinity} tone={tone} />
    </li>
  );
}

export function OpenersPanel({ plan, onCite }: { plan: TourPlan; onCite: OnCite }) {
  const o = plan.openers;
  if (!o) return null;
  return (
    <Panel title="Opener shortlist" kicker={`Same crowd, smaller fee · popularity ≤ ${o.maxPopularity.toFixed(2)}`} evidence={o.evidence} onCite={onCite}>
      <ul className="space-y-3">
        {o.items.slice(0, 6).map((e) => (
          <EntityRow
            key={e.id}
            e={e}
            extra={
              <span className="block text-[11px] text-muted">
                popularity {num(e.popularity)}
                {e.because.length > 0 && <> · because fans of {e.because.join(", ")}</>}
              </span>
            }
          />
        ))}
      </ul>
    </Panel>
  );
}

export function SponsorsPanel({ plan, onCite }: { plan: TourPlan; onCite: OnCite }) {
  const s = plan.sponsors;
  if (!s) return null;
  return (
    <Panel title="Sponsor targets" kicker={s.category ? `Brand partners · ${s.category}` : "Brand partners"} evidence={s.evidence} onCite={onCite}>
      <ul className="space-y-3">
        {s.items.slice(0, 6).map((e) => (
          <EntityRow key={e.id} e={e} tone="coral" extra={e.subtype ? <span className="block text-[11px] text-muted">{e.subtype}</span> : undefined} />
        ))}
      </ul>
    </Panel>
  );
}

export function MediaPanel({ plan, onCite }: { plan: TourPlan; onCite: OnCite }) {
  const m = plan.media;
  if (!m) return null;
  return (
    <Panel title="Where to buy ads" kicker="Podcasts & TV this crowd over-indexes on" evidence={m.evidence} onCite={onCite}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="eyebrow mb-2">Podcasts</p>
          <ul className="space-y-3">
            {m.podcasts.slice(0, 5).map((e) => (
              <EntityRow key={e.id} e={e} tone="slate" />
            ))}
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-2">TV audiences</p>
          <ul className="space-y-3">
            {m.shows.slice(0, 5).map((e) => (
              <EntityRow key={e.id} e={e} tone="slate" />
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

export function PlaybookPanel({ plan, onCite }: { plan: TourPlan; onCite: OnCite }) {
  if (!plan.playbook.length) return null;
  const order = plan.audience?.tasteRoute.map((c) => c.name) ?? [];
  const cards = [...plan.playbook].sort((a, b) => order.indexOf(a.city) - order.indexOf(b.city));
  return (
    <Panel title="City playbook" kicker="After-show, VIP packages, pop-ups" onCite={onCite}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((p) => (
          <div key={p.city} className="rounded-lg border border-line bg-ink/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-display text-lg uppercase tracking-wide text-amber">
                {order.indexOf(p.city) + 1}. {p.city}
              </span>
              <Cite evidence={p.evidence} onCite={onCite} />
            </div>
            <ul className="space-y-1.5 text-[13px]">
              {p.places.slice(0, 3).map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {e.name}
                    {e.subtype && <span className="text-muted"> · {e.subtype}</span>}
                  </span>
                  <span className="font-mono text-[11px] text-muted">{num(e.affinity)}</span>
                </li>
              ))}
              {!p.places.length && <li className="text-muted">No matching places returned.</li>}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function BaselinePanel({ plan, onCite }: { plan: TourPlan; onCite: OnCite }) {
  const b = plan.baseline;
  const a = plan.audience;
  if (!b || !a) return null;
  const encoreOpeners = new Set(plan.openers?.items.map((e) => e.name.toLowerCase()));
  return (
    <Panel
      title={b.source === "llm" ? "LLM alone vs Encore" : "Why not just play the big cities?"}
      kicker={b.source === "llm" ? `Same brief, ${b.model ?? "LLM"} without Qloo` : "Population-ranked baseline"}
      evidence={a.evidence}
      onCite={onCite}
    >
      <p className="mb-4 text-[15px] leading-relaxed text-cream/90">{b.note}</p>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <p className="eyebrow mb-2">{b.source === "llm" ? "LLM-only cities, scored by Qloo" : "Biggest metros, scored by Qloo"}</p>
          <ul className="space-y-2">
            {b.cities.map((c) => (
              <li key={c.name} className="grid grid-cols-[1fr_3rem] items-center gap-2 text-sm">
                <span>
                  {c.name}
                  {c.tasteRank && <span className="ml-2 font-mono text-[11px] text-muted">taste #{c.tasteRank}</span>}
                  <Bar value={c.affinity} tone="slate" />
                </span>
                <span className="text-right font-mono text-xs text-muted">{num(c.affinity)}</span>
              </li>
            ))}
          </ul>
        </div>
        {b.source === "llm" && (
          <div className="space-y-4 text-sm">
            <div>
              <p className="eyebrow mb-2">LLM-only openers</p>
              <ul className="space-y-1">
                {b.openers.map((o) => (
                  <li key={o} className="flex justify-between gap-2">
                    <span>{o}</span>
                    <span className="font-mono text-[11px] text-muted">
                      {encoreOpeners.has(o.toLowerCase()) ? "also in Encore" : "no Qloo evidence"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="eyebrow mb-2">LLM-only sponsors</p>
              <p className="text-cream/80">{b.sponsors.join(", ") || "—"}</p>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
