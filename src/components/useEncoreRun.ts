"use client";

import { useCallback, useReducer, useRef } from "react";
import type { AgentEvent, RunInfo, StepId, TourPlan, TourRequest } from "@/lib/agent/types";
import type { QlooRequestRecord } from "@/lib/qloo/types";

export type FeedItem =
  | { kind: "step"; id: StepId; label: string; status: "running" | "done" | "error"; detail?: string; count: number }
  | { kind: "thought"; text: string }
  | { kind: "notice"; level: "info" | "warn"; message: string };

export interface RunState {
  status: "idle" | "running" | "done" | "error";
  brief?: string;
  info?: RunInfo;
  request?: TourRequest;
  feed: FeedItem[];
  requests: { index: number; record: QlooRequestRecord }[];
  plan?: TourPlan;
  error?: string;
  ms?: number;
  replayed?: boolean;
}

type Action = { type: "start"; brief: string } | { type: "event"; event: AgentEvent } | { type: "fail"; message: string };

const initial: RunState = { status: "idle", feed: [], requests: [] };

function reduce(state: RunState, action: Action): RunState {
  if (action.type === "start") return { ...initial, status: "running", brief: action.brief };
  if (action.type === "fail") return { ...state, status: "error", error: action.message };
  const e = action.event;
  switch (e.type) {
    case "meta":
      return { ...state, info: e.info, request: e.request };
    case "step": {
      const i = state.feed.findIndex((f) => f.kind === "step" && f.id === e.id);
      if (i < 0) {
        return {
          ...state,
          feed: [...state.feed, { kind: "step", id: e.id, label: e.label, status: e.status, detail: e.detail, count: e.status === "done" ? 1 : 0 }],
        };
      }
      const prev = state.feed[i] as Extract<FeedItem, { kind: "step" }>;
      const next = {
        ...prev,
        status: e.status,
        detail: e.detail ?? prev.detail,
        count: prev.count + (e.status === "done" ? 1 : 0),
      };
      const feed = [...state.feed];
      feed[i] = next;
      return { ...state, feed };
    }
    case "thought":
      return { ...state, feed: [...state.feed, { kind: "thought", text: e.text }] };
    case "notice":
      return { ...state, feed: [...state.feed, { kind: "notice", level: e.level, message: e.message }] };
    case "qloo":
      return { ...state, requests: [...state.requests, { index: e.index, record: e.record }] };
    case "plan":
      return { ...state, plan: e.plan, request: e.plan.request };
    case "done":
      return { ...state, status: "done", ms: e.ms, replayed: e.replayed };
    case "error":
      return { ...state, status: "error", error: e.message };
    default:
      return state;
  }
}

/** Posts the brief to /api/plan and folds the NDJSON event stream into UI state. */
export function useEncoreRun() {
  const [state, dispatch] = useReducer(reduce, initial);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (brief: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: "start", brief });
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (HTTP ${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawEnd = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const event = JSON.parse(line) as AgentEvent;
          if (event.type === "done" || event.type === "error") sawEnd = true;
          dispatch({ type: "event", event });
        }
      }
      if (!sawEnd) throw new Error("The connection closed before the plan was finished.");
    } catch (error) {
      if (controller.signal.aborted) return;
      dispatch({ type: "fail", message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  return { state, run };
}
