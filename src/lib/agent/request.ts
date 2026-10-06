import { detectRegion, normalizeName, type Region } from "../geo/cities";
import { ARTISTS, BRAND_CATEGORY_TAGS } from "../qloo/mock-data";
import type { TourRequest } from "./types";

export const MIN_STOPS = 3;
export const MAX_STOPS = 8;
export const MAX_BRIEF_LENGTH = 400;

const NUMBER_WORDS: Record<string, number> = {
  three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

export function clampStops(n: number): number {
  if (!Number.isFinite(n)) return 6;
  return Math.max(MIN_STOPS, Math.min(MAX_STOPS, Math.round(n)));
}

function detectStops(text: string): number | undefined {
  const m = text.match(/\b(\d{1,2}|three|four|five|six|seven|eight|nine|ten)[\s-]*(?:date|stop|show|city|cities|night|gig)s?\b/i);
  if (!m) return undefined;
  const raw = m[1].toLowerCase();
  return clampStops(NUMBER_WORDS[raw] ?? Number(raw));
}

export function detectSponsorCategory(text: string): string | undefined {
  const t = ` ${normalizeName(text)} `;
  const hit = BRAND_CATEGORY_TAGS.find((c) => c.keywords.some((kw) => t.includes(` ${kw} `)));
  return hit ? hit.keywords[0] : undefined;
}

function detectArtist(text: string): string | undefined {
  const t = normalizeName(text);
  // Known names first (longest first so "Durand Jones & The Indications" beats "Durand").
  const known = [...ARTISTS]
    .sort((a, b) => b.name.length - a.name.length)
    .find((a) => {
      const n = normalizeName(a.name);
      return n && ` ${t} `.includes(` ${n} `);
    });
  if (known) return known.name;
  const patterns = [
    /\b(?:for|by|with)\s+([^,.;:!?\n]+?)(?=\s*(?:[,.;:!?\n]|$|\s+(?:in|across|through|around|on|next|this|with|we|our|small|low|tight)\b))/i,
    /^\s*([^,.;:!?\n]+?)\s+(?:tour|run|headline)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    const candidate = m?.[1]
      ?.replace(/^(?:a|an|the)\s+/i, "")
      .replace(/^\d+[\s-]*(?:date|stop|show|city)s?\s+/i, "")
      .replace(/^(?:us|u\.s\.|usa|european|europe|latam|north american)\s+(?:tour\s+)?(?:for\s+)?/i, "")
      .trim();
    if (candidate && candidate.length >= 2 && candidate.length <= 60) return candidate;
  }
  return undefined;
}

/** Deterministic parse used by the scripted agent and as a safety net for the LLM agent. */
export function parseBrief(brief: string, defaults: Partial<TourRequest> = {}): TourRequest {
  const text = brief.slice(0, MAX_BRIEF_LENGTH).trim();
  const region: Region = defaults.region ?? detectRegion(text) ?? "north-america";
  return {
    brief: text,
    artist: defaults.artist ?? detectArtist(text) ?? text.split(/[,.;\n]/)[0].slice(0, 60).trim(),
    region,
    stops: clampStops(defaults.stops ?? detectStops(text) ?? 6),
    sponsorCategory: defaults.sponsorCategory ?? detectSponsorCategory(text),
  };
}
