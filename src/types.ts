/** Number of weeks in a year of results: week 1 is 1–7 January, week 53 the last one or two days. */
export const WEEKS = 53;

/** Where a file's content came from. */
export interface Provenance {
  readonly release: string;
  /** Source IDs, as listed in `sources.json`. */
  readonly sources: readonly string[];
  readonly licences: readonly string[];
  readonly gbif_download_dois: readonly string[];
  readonly method: string | null;
  readonly taxonomy: string | null;
  readonly boundaries: string | null;
  readonly ranges: readonly string[] | null;
  readonly protection: Readonly<Record<string, string>> | null;
  readonly code: string | null;
  readonly run: string | null;
}

/** The wrapper every published file shares. */
export interface PublishedFile<Kind extends string, Data> {
  /** The file's path from the API root. */
  readonly id: string;
  readonly kind: Kind;
  /** Format name and version, for example `county-weekly/1.0`. */
  readonly format: string;
  readonly provenance: Provenance;
  readonly data: Data;
}

/** An area code: lowercase ISO 3166-2 for a state (`us-oh`), the Census GEOID for a county (`39049`). */
export type Area = string;
export type Level = "state" | "county";

/** Why season weeks are withheld. */
export type Withheld = "year-round" | "two-seasons" | "one-year" | "precision";

/** A mapped range's seasons. */
export type RangeSeason =
  "year-round" | "summer" | "winter" | "migratory" | "passage";

export type CurrentFile = PublishedFile<
  "current",
  { readonly release: string; readonly published_at: string }
>;

export interface ReleaseEntry {
  readonly release: string;
  readonly status: "current" | "available" | "withdrawn";
  readonly published_at: string;
  readonly doi: string | null;
  readonly builds_on: string | null;
  readonly reason: string | null;
}
export type ReleasesFile = PublishedFile<
  "releases",
  { readonly releases: readonly ReleaseEntry[] }
>;

export type TermsFile = PublishedFile<
  "terms",
  {
    readonly licence: string;
    readonly licence_url: string;
    readonly cite: string;
    readonly credit: string;
    readonly warranty: string;
    readonly contact: string;
  }
>;

/** One file listed in a release manifest. */
export interface ManifestEntry {
  /** Path relative to the release folder, for example `catalogue/0.json`. */
  readonly path: string;
  readonly format: string;
  readonly sha256: string;
  readonly bytes: number;
}
export type ManifestFile = PublishedFile<
  "manifest",
  {
    readonly release: string;
    readonly published_at: string;
    readonly files: readonly ManifestEntry[];
    readonly counts: {
      readonly species: number;
      readonly state_results: number;
      readonly county_results: number;
      readonly records: number;
    };
  }
>;

export type NotesFile = PublishedFile<
  "notes",
  {
    readonly release: string;
    readonly previous: string | null;
    readonly results: {
      readonly added: number;
      readonly changed: number;
      readonly removed: number;
    };
    readonly key_changes: readonly {
      readonly old: string;
      readonly new: string;
    }[];
    readonly corrections: readonly string[];
    readonly formats: readonly {
      readonly format: string;
      readonly change: string;
      readonly until: string | null;
    }[];
  }
>;

export interface Classification {
  readonly kingdom: string | null;
  readonly phylum: string | null;
  readonly class: string | null;
  readonly order: string | null;
  readonly family: string | null;
  readonly genus: string | null;
}

/** One species in the catalogue. */
export interface CatalogueEntry extends Classification {
  readonly species_key: string;
  readonly scientific_name: string;
  readonly common_name: string | null;
  readonly rank: string;
  readonly group: string | null;
  readonly slug: string | null;
  /** States with a result for this species. */
  readonly states: readonly Area[];
}
export type CatalogueFile = PublishedFile<
  "catalogue",
  { readonly species: readonly CatalogueEntry[] }
>;

/** Season weeks: early, middle and late (5th, 50th and 95th percentiles), or empty. */
export type SeasonWeeks = readonly [number, number, number] | readonly [];

export type SpeciesFile = PublishedFile<
  "species",
  {
    readonly species_key: string;
    readonly scientific_name: string;
    readonly authorship: string | null;
    readonly common_name: string | null;
    readonly synonyms: readonly string[];
    readonly rank: string;
    readonly classification: Classification;
    readonly group: string | null;
    readonly slug: string | null;
    readonly areas: readonly {
      readonly area: Area;
      readonly level: Level;
      readonly records: number;
      readonly season: SeasonWeeks;
      readonly season_withheld: Withheld | null;
    }[];
    readonly ranges: readonly {
      readonly area: Area;
      readonly level: Level;
      readonly source: string | null;
      readonly seasons: readonly RangeSeason[];
    }[];
  }
>;

export type SlugsFile = PublishedFile<
  "slugs",
  {
    /** Slug to species key. */
    readonly species: Readonly<Record<string, string>>;
    /** Old slug to current slug. */
    readonly redirects: Readonly<Record<string, string>>;
  }
>;

export type GroupsFile = PublishedFile<
  "groups",
  {
    readonly groups: readonly {
      readonly group: string;
      readonly name: string;
      readonly taxa: readonly string[];
      readonly species: number;
    }[];
  }
>;

/** One searchable name: the name, what kind it is, and its species key. */
export type SearchName = readonly [
  string,
  "scientific" | "common" | "synonym",
  string,
];
export type SearchFile = PublishedFile<
  "search",
  { readonly names: readonly SearchName[] }
>;

export interface RegionArea {
  readonly area: Area;
  readonly level: Level;
  readonly name: string;
  readonly slug: string;
  readonly species_keys: readonly string[];
  readonly range_species_keys: readonly string[];
  /** Records of all species counted in the area, weeks 1 to 53. */
  readonly effort: readonly number[];
}
export type RegionFile = PublishedFile<
  "region",
  {
    readonly state: Area;
    readonly name: string;
    readonly slug: string;
    readonly areas: readonly RegionArea[];
  }
>;

/** The phenology result for one species in one county or state. */
export interface WeeklyResult {
  readonly area: Area;
  readonly species_key: string;
  readonly included_records: number;
  readonly contributing_years: number;
  readonly thresholds: { readonly records: number; readonly years: number };
  /** Records counted and years contributing, each for weeks 1 to 53. */
  readonly weekly: {
    readonly records: readonly number[];
    readonly years: readonly number[];
  };
  readonly season: SeasonWeeks;
  readonly season_withheld: Withheld | null;
  /** Records of all species counted in the area, weeks 1 to 53. */
  readonly effort: readonly number[];
  /** What the result does not show. */
  readonly limits: string;
}
export type CountyResultFile = PublishedFile<"county-weekly", WeeklyResult>;
export type StateResultFile = PublishedFile<"state-weekly", WeeklyResult>;

export type AttributionFile = PublishedFile<
  "attribution",
  {
    readonly area: Area;
    readonly species_key: string;
    readonly datasets: readonly {
      readonly dataset_key: string;
      readonly title: string | null;
      readonly publisher: string | null;
      readonly citation: string | null;
      readonly url: string | null;
      readonly records: number;
    }[];
    readonly gbif_download_dois: readonly string[];
    /** Links to the records behind the result; `null` for a sensitive species. */
    readonly record_links: readonly string[] | null;
  }
>;

/**
 * Backyard labels, one letter per week: `c` commonly reported this time of
 * year, `s` seasonally reported, `r` reported in your area, `m` within its
 * mapped range, `n` not enough evidence.
 */
export type BackyardLabel = "c" | "s" | "r" | "m" | "n";
export type BackyardFile = PublishedFile<
  "backyard",
  {
    readonly area: Area;
    readonly method: string;
    readonly evidence_through: string | null;
    readonly effort: readonly number[];
    readonly species: readonly {
      readonly species_key: string;
      readonly group: string | null;
      /** 53 letters, one per week. */
      readonly labels: string;
      readonly range: {
        readonly source: string | null;
        readonly seasons: readonly RangeSeason[];
      } | null;
    }[];
  }
>;

export type MethodsFile = PublishedFile<
  "methods",
  {
    readonly method: string;
    readonly data_rules: string;
    readonly thresholds: Readonly<Record<string, unknown>>;
    readonly weeks: string;
    readonly pooled_from: string;
    readonly taxonomy: string;
    readonly boundaries: string;
    readonly protection: Readonly<Record<string, string>>;
    readonly ranges: readonly string[];
    readonly limits: string;
  }
>;

export type SourcesFile = PublishedFile<
  "sources",
  {
    readonly sources: readonly {
      readonly source: string;
      readonly name: string;
      readonly kind: string;
      readonly licence: string;
      readonly licence_url: string | null;
      readonly use: string;
      readonly reviewed: string;
      readonly credit: string;
      readonly url: string;
    }[];
  }
>;

/** County outlines for maps, as a GeoJSON FeatureCollection. Display only. */
export type BoundariesFile = PublishedFile<
  "boundaries",
  {
    readonly type: "FeatureCollection";
    readonly features: readonly {
      readonly type: "Feature";
      readonly properties: {
        readonly area: Area;
        readonly name: string;
        readonly slug: string;
      };
      readonly geometry: {
        readonly type: "MultiPolygon";
        readonly coordinates: readonly (readonly (readonly (readonly number[])[])[])[];
      };
    }[];
  }
>;

export type PostalFile = PublishedFile<
  "postal",
  {
    /** ZIP code to its counties, each with the share of its land. */
    readonly zips: Readonly<
      Record<string, readonly (readonly [Area, number])[]>
    >;
  }
>;
