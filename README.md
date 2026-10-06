# Encore — the tour strategist with taste

Encore is an AI agent for independent artists, managers and small promoters. Give it a one-line brief
("6-date US tour for Khruangbin, small budget, need an opener and a drinks sponsor") and it uses
**Qloo's cultural taste graph** to:

1. find the artist in Qloo (`/search`);
2. map **where the audience over-indexes** with a Qloo heatmap, compare it with the "obvious" route
   (biggest metros) and surface **hidden markets** (`/v2/insights`, `filter.type=urn:heatmap`);
3. profile the audience's **taste DNA** — tags and age/gender skew (`urn:tag`, `urn:demographics`);
4. shortlist **affordable openers** that share the crowd (`urn:entity:artist` + `filter.popularity.max`
   + `feature.explainability`);
5. rank **sponsor brands**, optionally in a category found with `/v2/tags` (`urn:entity:brand` + `filter.tags`);
6. pick **podcasts and TV shows** for targeted ad buys (`urn:entity:podcast`, `urn:entity:tv_show`);
7. scout **bars, restaurants and listening rooms** in every tour city for after-shows, VIP packages
   and pop-ups (`urn:entity:place` + `filter.location.query`);
8. write a **tour brief where every claim cites the Qloo request behind it** (`[Q3]` chips open the
   request in the provenance log), and benchmark it against an **LLM-only plan** scored with the same
   Qloo heatmap.

An LLM (Gemini, via the Vercel AI SDK) drives the loop: it parses the brief, chooses and sequences the
tools, narrates its reasoning, and writes the brief from the collected facts only. A deterministic
safety net finishes any step the model skips, so the judge always gets a complete, cited plan.

## Run it

```bash
npm install
cp .env.example .env.local   # optional: add keys
npm run dev                  # http://localhost:3000
```

| Variable | Effect |
|---|---|
| `QLOO_API_KEY` | Live Qloo data. Without it the app runs in **simulation mode** (clearly labelled in the UI). |
| `QLOO_API_URL` | Defaults to `https://hackathon.api.qloo.com` (the hackathon key only works there). |
| `QLOO_MODE` | `mock` or `live` to force a mode. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Enables the LLM agent (Google AI Studio key). Without it a scripted agent runs the same tools. |
| `ENCORE_LLM_MODEL` | Gemini model id, default `gemini-flash-latest`. |
| `ENCORE_LLM` | `off` to force the scripted agent. |

Keys stay on the server (route handlers); they are never sent to the browser or written to logs.

```bash
npm test        # vitest: parser, live client (fake fetch), simulation, scripted + LLM agent paths
npm run lint
npm run build
```

## How it works

- `src/lib/qloo/live.ts` — REST client: GET + `X-Api-Key`, timeout, bounded retries on 429/5xx,
  1-hour response cache (protects the quota when judges replay a demo), request log for provenance.
- `src/lib/qloo/mock.ts` — offline twin with the same interface: real public names, simulated affinities.
- `src/lib/agent/toolkit.ts` — the agent's tools; each records which Qloo requests back its output.
- `src/lib/agent/llm.ts` — AI SDK tool loop, grounded brief writer, LLM-only baseline.
- `src/lib/agent/run.ts` — orchestration and fallbacks; `src/app/api/plan/route.ts` streams events as NDJSON.
- `src/components/` — map (d3-geo), live agent feed, Qloo request log, result panels.

## Known limits

- Affinity is an aggregated, anonymous taste signal, **not a ticket-sales forecast**; routing ignores
  venue availability, dates and radius clauses.
- City coverage is a reference list of ~65 metros; heatmap cells are snapped to the nearest one
  (80 km). The US region uses a US-scoped heatmap; other regions use a global one.
- Some Qloo parameters are silently ignored when invalid; requests were written from the official
  docs and must be checked against a live key.
- Only public artist names are sent to Qloo — never personal data.

## License

MIT — see `LICENSE`.
