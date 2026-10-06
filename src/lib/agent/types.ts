import type { Region } from "../geo/cities";
import type { Demographics, QlooEntity, QlooRequestRecord, QlooTag } from "../qloo/types";

/** What the user asked for, after parsing the natural-language brief. */
export interface TourRequest {
  brief: string;
  artist: string;
  region: Region;
  stops: number;
  sponsorCategory?: string;
}

/** 1-based indices into the run's Qloo request log ("Q3" in the UI and the brief). */
export type Evidence = number[];

export interface CityScore {
  name: string;
  country: string;
  lat: number;
  lon: number;
  /** Metro population, millions. */
  pop: number;
  /** Qloo heatmap affinity of the artist's audience for this city, 0..1 (undefined = no signal). */
  affinity?: number;
  tasteRank?: number;
  popRank: number;
}

export interface RouteStop extends CityScore {
  /** In the taste route but not among the most populous cities: the "hidden market" insight. */
  hidden: boolean;
}

export interface HeatDot {
  lat: number;
  lon: number;
  affinity: number;
}

export interface AudienceMap {
  cities: CityScore[];
  tasteRoute: RouteStop[];
  obviousRoute: CityScore[];
  hiddenMarkets: string[];
  /** Big cities on the obvious route that the taste data says to deprioritise. */
  skipped: string[];
  dots: HeatDot[];
  evidence: Evidence;
}

export interface CityPlaybook {
  city: string;
  places: QlooEntity[];
  evidence: Evidence;
}

export interface Baseline {
  source: "llm" | "population";
  model?: string;
  cities: { name: string; affinity?: number; tasteRank?: number }[];
  openers: string[];
  sponsors: string[];
  note: string;
}

export interface TourPlan {
  request: TourRequest;
  artist?: QlooEntity & { evidence: Evidence };
  audience?: AudienceMap;
  dna?: { tags: QlooTag[]; demographics: Demographics | null; evidence: Evidence };
  openers?: { items: QlooEntity[]; maxPopularity: number; evidence: Evidence };
  sponsors?: { items: QlooEntity[]; category?: string; evidence: Evidence };
  media?: { podcasts: QlooEntity[]; shows: QlooEntity[]; evidence: Evidence };
  playbook: CityPlaybook[];
  baseline?: Baseline;
  brief?: string;
}

export type StepId = "parse" | "artist" | "audience" | "dna" | "openers" | "sponsors" | "media" | "playbook" | "baseline" | "brief";

export interface RunInfo {
  qloo: "live" | "mock";
  llm: { mode: "llm" | "scripted"; model?: string };
}

export type AgentEvent =
  | { type: "meta"; info: RunInfo; request: TourRequest }
  | { type: "step"; id: StepId; label: string; status: "running" | "done" | "error"; detail?: string }
  | { type: "thought"; text: string }
  | { type: "qloo"; index: number; record: QlooRequestRecord }
  | { type: "plan"; plan: TourPlan }
  | { type: "notice"; level: "info" | "warn"; message: string }
  | { type: "done"; ms: number; replayed?: boolean }
  | { type: "error"; message: string };

export type Emit = (event: AgentEvent) => void;
