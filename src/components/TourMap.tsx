"use client";

import { geoNaturalEarth1, geoPath } from "d3-geo";
import type { FeatureCollection } from "geojson";
import { useMemo } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import { CITIES, citiesIn, type Region } from "@/lib/geo/cities";
import type { AudienceMap } from "@/lib/agent/types";

const W = 960;
const H = 540;

const topology = world as unknown as Topology<{ countries: GeometryCollection }>;
const COUNTRIES = feature(topology, topology.objects.countries) as unknown as FeatureCollection;

interface Props {
  region?: Region;
  usOnly?: boolean;
  audience?: AudienceMap;
  scanning?: boolean;
}

/** Region map: Qloo heat (coral), the population route (slate rings) and Encore's taste route (amber). */
export function TourMap({ region, usOnly, audience, scanning }: Props) {
  const projection = useMemo(() => {
    const pool = region ? citiesIn(region).filter((c) => !usOnly || c.country === "US") : CITIES;
    const pad = region ? 56 : 24;
    return geoNaturalEarth1().fitExtent(
      [
        [pad, pad],
        [W - pad, H - pad],
      ],
      { type: "MultiPoint", coordinates: pool.map((c) => [c.lon, c.lat]) },
    );
  }, [region, usOnly]);

  const countries = useMemo(() => {
    const path = geoPath(projection);
    return COUNTRIES.features.map((f, i) => ({ key: String(f.id ?? i), d: path(f) ?? "" }));
  }, [projection]);

  const xy = (lon: number, lat: number) => projection([lon, lat]) ?? [-100, -100];

  const stops = audience?.tasteRoute ?? [];
  const tasteNames = new Set(stops.map((s) => s.name));
  const routePath = stops
    .map((s, i) => {
      const [x, y] = xy(s.lon, s.lat);
      if (i === 0) return `M${x},${y}`;
      const [px, py] = xy(stops[i - 1].lon, stops[i - 1].lat);
      const mx = (px + x) / 2;
      const my = (py + y) / 2;
      const dx = x - px;
      const dy = y - py;
      const bend = 0.18;
      return `Q${mx - dy * bend},${my + dx * bend} ${x},${y}`;
    })
    .join(" ");

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-[#120f0d]">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Tour map">
        <defs>
          <radialGradient id="heat">
            <stop offset="0%" stopColor="#ff5d5d" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#ff5d5d" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ff5d5d" stopOpacity="0" />
          </radialGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width={W} height={H} fill="#120f0d" />
        <g>
          {countries.map((c) => (
            <path key={c.key} d={c.d} fill="#1d1916" stroke="#3a332d" strokeWidth={0.6} />
          ))}
        </g>

        {!audience &&
          (region ? citiesIn(region).filter((c) => !usOnly || c.country === "US") : CITIES).map((c, i) => {
            const [x, y] = xy(c.lon, c.lat);
            return (
              <circle
                key={c.name}
                cx={x}
                cy={y}
                r={2.5}
                fill="#a39a8c"
                className={scanning ? "pulse-dot" : undefined}
                style={scanning ? { animationDelay: `${(i % 9) * 0.12}s` } : undefined}
                opacity={0.6}
              />
            );
          })}

        {audience?.dots.map((d, i) => {
          const [x, y] = xy(d.lon, d.lat);
          return (
            <circle
              key={`h${i}`}
              cx={x}
              cy={y}
              r={6 + d.affinity * 26}
              fill="url(#heat)"
              opacity={0.25 + d.affinity * 0.6}
              className="pop-in"
              style={{ animationDelay: `${Math.min(i, 60) * 18}ms` }}
            />
          );
        })}

        {audience?.obviousRoute.map((c) => {
          const [x, y] = xy(c.lon, c.lat);
          const skipped = !tasteNames.has(c.name);
          return (
            <g key={`o${c.name}`} className="fade-up" style={{ animationDelay: "0.6s" }}>
              <circle cx={x} cy={y} r={8} fill="none" stroke="#8ea3b8" strokeWidth={1.5} strokeDasharray="3 3" />
              {skipped && (
                <text
                  x={x}
                  y={y + 22}
                  textAnchor="middle"
                  fontSize={12}
                  fill="#8ea3b8"
                  stroke="#120f0d"
                  strokeWidth={4}
                  paintOrder="stroke"
                  fontFamily="var(--font-geist-mono)"
                >
                  {c.name}
                </text>
              )}
            </g>
          );
        })}

        {stops.length > 1 && (
          <path
            d={routePath}
            fill="none"
            stroke="#ffb43a"
            strokeWidth={2.5}
            strokeLinecap="round"
            pathLength={1}
            className="route-draw"
            filter="url(#glow)"
            style={{ animationDelay: "0.9s" }}
          />
        )}

        {stops.map((s, i) => {
          const [x, y] = xy(s.lon, s.lat);
          return (
            <g key={`s${s.name}`} className="pop-in" style={{ animationDelay: `${1 + i * 0.25}s` }}>
              <circle cx={x} cy={y} r={12} fill={s.hidden ? "#ffb43a" : "#0e0c0b"} stroke="#ffb43a" strokeWidth={2} />
              <text
                x={x}
                y={y + 4.5}
                textAnchor="middle"
                fontSize={13}
                fontWeight={700}
                fill={s.hidden ? "#0e0c0b" : "#ffb43a"}
                fontFamily="var(--font-geist-mono)"
              >
                {i + 1}
              </text>
              <text
                x={x}
                y={y - 18}
                textAnchor="middle"
                fontSize={15}
                fill="#f2e9d8"
                stroke="#120f0d"
                strokeWidth={5}
                paintOrder="stroke"
                fontWeight={600}
              >
                {s.name}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-ink/80 px-3 py-2 font-mono text-[11px] text-muted backdrop-blur">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-coral/80" /> Qloo audience heat
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-slate" /> Obvious route (population)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber" /> Hidden market
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-amber" /> Taste route stop
        </span>
      </div>
    </div>
  );
}
