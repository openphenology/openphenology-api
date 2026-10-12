/** Number of weeks in a year of results: week 1 is 1–7 January, week 53 the last one or two days. */
export const WEEKS = 53;

/** One data source behind a file. */
export interface Source {
  readonly name: string;
  readonly licence: string;
  readonly url?: string;
}

/** Where a file's content came from. */
export interface Provenance {
  readonly sources: readonly Source[];
  readonly gbif_download_dois: readonly string[];
  readonly method_version: string;
  readonly taxonomy_version: string;
  readonly boundary_version: string;
  readonly code_version: string;
  readonly run_id: string;
}

/** The wrapper every published file shares. */
export interface PublishedFile<Kind extends string, Data> {
  readonly id: string;
  readonly kind: Kind;
  /** Format name and version, for example `county-weekly/1.0`. */
  readonly format: string;
  readonly provenance: Provenance;
  readonly data: Data;
}

/** `current.json`: the release to read. */
export type CurrentFile = PublishedFile<
  "current",
  { readonly release: string }
>;

/** One file listed in a release manifest. */
export interface ManifestEntry {
  /** Path relative to the release folder, for example `species/0.json`. */
  readonly path: string;
  readonly sha256: string;
  readonly format: string;
  readonly bytes: number;
}

/** `releases/<release>/manifest.json`. */
export type ManifestFile = PublishedFile<
  "manifest",
  {
    readonly release: string;
    readonly files: readonly ManifestEntry[];
    readonly counts: Readonly<Record<string, number>>;
  }
>;

/** A species with published results. */
export interface Species {
  readonly species_key: string;
  readonly scientific_name: string;
  readonly rank: string;
  /** States with at least one result for this species. */
  readonly states: readonly string[];
}

/** One shard of the species catalogue: `species.json` or `species/<n>.json`. */
export type SpeciesFile = PublishedFile<
  "species",
  { readonly species: readonly Species[] }
>;

/** One area within a state summary. */
export interface RegionArea {
  readonly area: string;
  readonly species_keys: readonly string[];
  /** Records of all species counted in the area, weeks 1 to 53. */
  readonly effort: readonly number[];
}

/** `regions/<state>.json`: species with results by area, and effort. */
export type RegionFile = PublishedFile<
  "region",
  { readonly state: string; readonly areas: readonly RegionArea[] }
>;

/** Early, middle and late weeks of the recorded season (5th, 50th and 95th percentiles). */
export interface Season {
  readonly early: number;
  readonly middle: number;
  readonly late: number;
}

/** The phenology result for one species in one county or state. */
export interface WeeklyResult {
  readonly area: string;
  readonly species_key: string;
  readonly included_records: number;
  readonly contributing_years: number;
  readonly thresholds: {
    readonly min_records: number;
    readonly min_years: number;
  };
  /** Records counted and years contributing, each for weeks 1 to 53. */
  readonly weekly: {
    readonly records: readonly number[];
    readonly years: readonly number[];
  };
  /** Empty when the method withholds it. */
  readonly season: Season | null;
  /** Records of all species counted in the area, weeks 1 to 53. */
  readonly effort: readonly number[];
  /** What the result does not show. */
  readonly limits: string;
}

export type CountyResultFile = PublishedFile<"county-weekly", WeeklyResult>;
export type StateResultFile = PublishedFile<"state-weekly", WeeklyResult>;
