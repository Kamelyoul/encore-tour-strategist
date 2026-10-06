import { REGION_LABELS } from "../geo/cities";
import { q, round2 } from "./toolkit";
import type { TourPlan } from "./types";

const AGE_LABELS: Record<string, string> = {
  "24_and_younger": "24 and younger",
  "25_to_29": "25–29",
  "30_to_34": "30–34",
  "35_to_44": "35–44",
  "45_to_54": "45–54",
  "55_and_older": "55+",
};

export function ageLabel(key: string): string {
  return AGE_LABELS[key] ?? key.replace(/_/g, " ");
}

const cite = (e: number[] | undefined) => (e?.length ? ` [${q(e)}]` : "");
const fmt = (x: number | undefined) => (x === undefined ? "n/a" : (round2(x) ?? 0).toFixed(2));

/** Deterministic, fully-cited brief used when no LLM is configured (or as the LLM's fallback). */
export function templateBrief(plan: TourPlan): string {
  const { request, artist, audience, dna, openers, sponsors, media, playbook } = plan;
  const name = artist?.name ?? request.artist;
  const lines: string[] = [];
  lines.push(`## ${name} — ${request.stops}-date ${REGION_LABELS[request.region]} run`);
  if (audience) {
    lines.push(
      `**Route (taste-ranked, sequenced to minimise travel):** ${audience.tasteRoute.map((c) => c.name).join(" → ")}${cite(audience.evidence)}`,
    );
    const hidden = audience.tasteRoute.filter((c) => c.hidden);
    if (hidden.length) {
      lines.push("### Hidden markets");
      for (const c of hidden) {
        lines.push(
          `- **${c.name}** — audience affinity ${fmt(c.affinity)}, #${c.tasteRank} by taste but only #${c.popRank} by population.${cite(audience.evidence)}`,
        );
      }
    }
    if (audience.skipped.length) {
      const skipped = audience.cities.filter((c) => audience.skipped.includes(c.name));
      lines.push(
        `**Deprioritise:** ${skipped.map((c) => `${c.name} (affinity ${fmt(c.affinity)})`).join(", ")} — big markets, weaker taste match for this audience.${cite(audience.evidence)}`,
      );
    }
  }
  if (dna) {
    lines.push("### Audience DNA");
    lines.push(`- Taste signature: ${dna.tags.slice(0, 6).map((t) => t.name).join(", ")}.${cite(dna.evidence)}`);
    if (dna.demographics) {
      const top = Object.entries(dna.demographics.age).sort((a, b) => b[1] - a[1])[0];
      if (top) lines.push(`- Strongest age skew: ${ageLabel(top[0])}.${cite(dna.evidence)}`);
    }
  }
  if (openers?.items.length) {
    lines.push("### Opener shortlist (smaller acts, same audience)");
    for (const o of openers.items.slice(0, 3)) {
      lines.push(`- **${o.name}** — affinity ${fmt(o.affinity)}, popularity ${fmt(o.popularity)}.${cite(openers.evidence)}`);
    }
  }
  if (sponsors?.items.length) {
    lines.push(`### Sponsor targets${sponsors.category ? ` (${sponsors.category})` : ""}`);
    for (const s of sponsors.items.slice(0, 3)) {
      lines.push(`- **${s.name}** — affinity ${fmt(s.affinity)}.${cite(sponsors.evidence)}`);
    }
  }
  if (media && (media.podcasts.length || media.shows.length)) {
    lines.push("### Where to buy ads");
    lines.push(
      `- Podcasts: ${media.podcasts.slice(0, 3).map((p) => p.name).join(", ")}; TV audiences: ${media.shows.slice(0, 3).map((s) => s.name).join(", ")}.${cite(media.evidence)}`,
    );
  }
  if (playbook.length) {
    lines.push("### City playbook (after-show, VIP, pop-up)");
    for (const p of playbook) {
      if (!p.places.length) continue;
      lines.push(`- **${p.city}**: ${p.places.slice(0, 2).map((x) => x.name).join(" or ")}.${cite(p.evidence)}`);
    }
  }
  lines.push("### Caveats");
  lines.push(
    "- Affinity scores are aggregated taste signals from Qloo, not ticket-sales forecasts. Confirm routing days, venue holds and radius clauses before booking.",
  );
  return lines.join("\n");
}
