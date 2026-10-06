"use client";

import { useEffect, useRef } from "react";
import type { QlooRequestRecord } from "@/lib/qloo/types";
import type { FeedItem } from "./useEncoreRun";

export function AgentFeed({ feed, running }: { feed: FeedItem[]; running: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll the feed itself, never the page.
    const el = box.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [feed.length]);

  return (
    <div ref={box} className="max-h-[380px] space-y-1.5 overflow-y-auto pr-1">
      {feed.map((item, i) => {
        if (item.kind === "thought") {
          return (
            <p key={i} className="fade-up border-l-2 border-amber/40 pl-3 text-[13px] italic leading-snug text-muted">
              {item.text}
            </p>
          );
        }
        if (item.kind === "notice") {
          return (
            <p
              key={i}
              className={`fade-up rounded-md px-2.5 py-1.5 text-[12px] leading-snug ${
                item.level === "warn" ? "bg-coral/10 text-coral" : "bg-slate/10 text-slate"
              }`}
            >
              {item.message}
            </p>
          );
        }
        return (
          <div key={i} className="fade-up flex items-start gap-2.5 text-[13.5px]">
            <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center">
              {item.status === "running" && <span className="pulse-dot h-2 w-2 rounded-full bg-amber" />}
              {item.status === "done" && <span className="text-mint">✓</span>}
              {item.status === "error" && <span className="text-coral">!</span>}
            </span>
            <span className="text-cream">
              {item.label}
              {item.id === "playbook" && item.count > 0 && <span className="text-muted"> · {item.count} cities</span>}
              {item.detail && <span className="block text-[12px] text-muted">{item.detail}</span>}
            </span>
          </div>
        );
      })}
      {running && !feed.length && <p className="text-[13px] text-muted">Connecting to the agent…</p>}
    </div>
  );
}

function describe(r: QlooRequestRecord): string {
  const t = r.params["filter.type"];
  if (r.path === "/search") return `search “${r.params.query ?? ""}”`;
  if (r.path === "/v2/tags") return `tags “${r.params["filter.query"] ?? ""}”`;
  if (!t) return r.path;
  const kind = t.replace("urn:entity:", "").replace("urn:", "");
  const where = r.params["filter.location.query"];
  return `insights → ${kind}${where ? ` in ${where}` : ""}`;
}

export function RequestLog({
  requests,
  highlight,
  onSelect,
}: {
  requests: { index: number; record: QlooRequestRecord }[];
  highlight?: number;
  onSelect: (i: number | undefined) => void;
}) {
  const cached = requests.filter((r) => r.record.cached).length;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="eyebrow">Qloo requests · provenance</span>
        <span className="font-mono text-[11px] text-faint">
          {requests.length} calls{cached ? ` · ${cached} cached` : ""}
        </span>
      </div>
      <ol className="max-h-[380px] space-y-1 overflow-y-auto pr-1 font-mono text-[12px]">
        {requests.map(({ index, record }) => {
          const open = highlight === index;
          return (
            <li key={index} id={`q-${index}`} className="fade-up">
              <button
                type="button"
                onClick={() => onSelect(open ? undefined : index)}
                className={`w-full rounded-md border px-2 py-1.5 text-left transition-colors ${
                  open ? "border-amber/60 bg-amber/10" : "border-transparent hover:border-line hover:bg-ink-3"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-7 shrink-0 text-amber">Q{index}</span>
                  <span className="truncate text-cream/90">{describe(record)}</span>
                  <span className={`ml-auto shrink-0 ${record.status === "ok" ? "text-faint" : "text-coral"}`}>
                    {record.status === "ok" ? `${record.resultCount} · ${record.cached ? "cache" : `${record.ms}ms`}` : "error"}
                  </span>
                </span>
                {open && (
                  <span className="mt-1.5 block break-all text-[11px] leading-relaxed text-muted">
                    GET {record.path}
                    {Object.entries(record.params).map(([k, v]) => (
                      <span key={k} className="block pl-3">
                        <span className="text-slate">{k}</span>={v}
                      </span>
                    ))}
                    {record.error && <span className="block text-coral">{record.error}</span>}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {!requests.length && <li className="text-faint">No calls yet.</li>}
      </ol>
    </div>
  );
}
