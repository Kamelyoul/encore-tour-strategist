/** Normalised shapes returned by every Qloo client (live or mock). */

export type EntityType =
  | "urn:entity:artist"
  | "urn:entity:book"
  | "urn:entity:brand"
  | "urn:entity:destination"
  | "urn:entity:locality"
  | "urn:entity:movie"
  | "urn:entity:person"
  | "urn:entity:place"
  | "urn:entity:podcast"
  | "urn:entity:tv_show"
  | "urn:entity:videogame";

export interface QlooEntity {
  id: string;
  name: string;
  type?: string;
  subtype?: string;
  /** Global popularity percentile, 0..1. */
  popularity?: number;
  /** Affinity to the query signals, 0..1 (only on insights results). */
  affinity?: number;
  description?: string;
  image?: string;
  address?: string;
  city?: string;
  country?: string;
  priceLevel?: number;
  rating?: number;
  tags: { id: string; name: string }[];
  /** Names of input entities that explain this result (feature.explainability). */
  because: string[];
}

export interface QlooTag {
  id: string;
  name: string;
  type?: string;
  affinity?: number;
  popularity?: number;
}

export interface HeatPoint {
  latitude: number;
  longitude: number;
  name?: string;
  affinity: number;
  popularity?: number;
}

export interface Demographics {
  /** Relative affinity per age bucket, roughly -1..1. */
  age: Record<string, number>;
  /** Relative affinity per gender, roughly -1..1. */
  gender: Record<string, number>;
}

/** One HTTP request made to Qloo, kept for provenance in the UI. */
export interface QlooRequestRecord {
  method: "GET";
  path: string;
  params: Record<string, string>;
  status: "ok" | "error";
  ms: number;
  resultCount: number;
  cached: boolean;
  error?: string;
}

export type QueryValue = string | number | boolean | string[] | undefined | null;
export type QueryParams = Record<string, QueryValue>;

export interface InsightsParams {
  filterType: EntityType | "urn:heatmap" | "urn:tag" | "urn:demographics";
  signalEntities?: string[];
  signalTags?: string[];
  filterTags?: string[];
  excludeTags?: string[];
  filterLocationQuery?: string;
  signalLocationQuery?: string;
  filterEntities?: string[];
  excludeEntities?: string[];
  popularityMax?: number;
  popularityMin?: number;
  take?: number;
  explain?: boolean;
  extra?: QueryParams;
}

export interface QlooClient {
  readonly mode: "live" | "mock";
  search(query: string, types?: EntityType[], take?: number): Promise<QlooEntity[]>;
  findTags(query: string, take?: number): Promise<QlooTag[]>;
  insightsEntities(params: InsightsParams): Promise<QlooEntity[]>;
  insightsTags(signalEntities: string[], take?: number): Promise<QlooTag[]>;
  demographics(signalEntities: string[]): Promise<Demographics | null>;
  heatmap(signalEntity: string, locationQuery?: string, take?: number): Promise<HeatPoint[]>;
  /** Requests made by this client instance, in order (for provenance). */
  readonly log: QlooRequestRecord[];
}

export class QlooError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "QlooError";
  }
}
