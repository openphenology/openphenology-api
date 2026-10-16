// The shapes of every published file, version 1 of each format. Field names
// match the JSON exactly.

/** Number of weeks in a year of results: week 1 is 1–7 January, week 53 the last one or two days. */
export const WEEKS = 53;

/** Where a file's content came from. A field that does not apply is `null`. */
export interface Provenance {
  /** The release the file belongs to, such as `2026-10-19`. */
  readonly release: string;
  /** Source IDs, as listed in `sources.json`. */
  readonly sources: readonly string[];
  /** The licences of those sources. */
  readonly licences: readonly string[];
  /** The GBIF downloads the records came from, as DOIs. */
  readonly gbif_download_dois: readonly string[];
  /** The method version, such as `seasonal-3`. */
  readonly method: string | null;
  /** The taxonomy version species keys come from. */
  readonly taxonomy: string | null;
  /** The boundary version areas come from. */
  readonly boundaries: string | null;
  /** Each mapped range edition used. */
  readonly ranges: readonly string[] | null;
  /** The version of each sensitive-species list applied, by list. */
  readonly protection: Readonly<Record<string, string>> | null;
  /** The commit of the code that produced the file. */
  readonly code: string | null;
  /** The run that produced the file. */
  readonly run: string | null;
}

/** The wrapper every published file shares. */
export interface PublishedFile<Kind extends string, Data> {
  /** The file's path from the API root. */
  readonly id: string;
  /** The format's name, such as `county-weekly`. */
  readonly kind: Kind;
  /** Format name and version, for example `county-weekly/1.0`. */
  readonly format: string;
  /** Where the content came from. */
  readonly provenance: Provenance;
  /** The content, as the format sets out. */
  readonly data: Data;
}

/**
 * A place's code: `us-` and the postal abbreviation for a state (`us-oh`,
 * its ISO 3166-2 code), or the 5-digit Census code for a county (`39049`,
 * its GEOID).
 */
export type Area = string;
/** Whether an area is a state or a county. */
export type Level = "state" | "county";

/**
 * Why season weeks are withheld:
 *
 * - `year-round`: the early-to-late span is more than 39 weeks, so there is
 *   no bounded season;
 * - `two-seasons`: the weekly records have two clear peaks;
 * - `one-year`: one calendar year holds more than 40% of the records;
 * - `precision`: the weeks are too uncertain to show.
 */
export type Withheld = "year-round" | "two-seasons" | "one-year" | "precision";

/**
 * Why a flowering result's `season` is empty: a reason in `Withheld`, or too
 * few records that show flowers (data rules `seasonal.md`).
 */
export type FloweringWithheld = Withheld | "too-few-records";

/** A mapped range's seasons. */
export type RangeSeason =
  "year-round" | "summer" | "winter" | "migratory" | "passage";

/** `current.json`: the current release. */
export type CurrentFile = PublishedFile<
  "current",
  {
    /** The current release ID. */
    readonly release: string;
    /** When it was published, `YYYY-MM-DDTHH:MM:SSZ`. */
    readonly published_at: string;
  }
>;

/** One release in `releases.json`. */
export interface ReleaseEntry {
  /** The release ID, its date. */
  readonly release: string;
  /** `current`, `available`, or `withdrawn` for a release whose files are deleted. */
  readonly status: "current" | "available" | "withdrawn";
  /** When it was published, `YYYY-MM-DDTHH:MM:SSZ`. */
  readonly published_at: string;
  /** Its DOI, when it is registered as a GBIF derived dataset. */
  readonly doi: string | null;
  /** The DOI of the latest registered release it builds on. */
  readonly builds_on: string | null;
  /** Why it was withdrawn. */
  readonly reason: string | null;
}
/** `releases.json`: every release and its status. */
export type ReleasesFile = PublishedFile<
  "releases",
  {
    /** Every release. */
    readonly releases: readonly ReleaseEntry[];
  }
>;

/** `terms.json`: the licence, how to cite and credit, and the contact. */
export type TermsFile = PublishedFile<
  "terms",
  {
    /** The licence of the outputs: `CC-BY-NC-4.0` (ODR-2026-021). */
    readonly licence: string;
    /** Where the licence is published. */
    readonly licence_url: string;
    /**
     * What the licence covers, as the data rules give it word for word. Added
     * in `terms/1.1`, so absent from `terms/1.0` files.
     */
    readonly scope?: string;
    /** How to cite OpenPhenology. */
    readonly cite: string;
    /** How to credit the sources. */
    readonly credit: string;
    /** The disclaimer of warranty. */
    readonly warranty: string;
    /** The contact address. */
    readonly contact: string;
  }
>;

/** One file listed in a release manifest. */
export interface ManifestEntry {
  /** Path relative to the release folder, for example `catalogue/0.json`. */
  readonly path: string;
  /**
   * Its format and version, such as `catalogue/1.0`; `null` for
   * `archive.tar.gz`, the release's one file that is not JSON.
   */
  readonly format: string | null;
  /** Its lowercase hex SHA-256. */
  readonly sha256: string;
  /** Its size in bytes, uncompressed. */
  readonly bytes: number;
}
/**
 * `manifest.json`: every file in a release, and the release's counts. From
 * `manifest/2.0` a large manifest is split on `files`: its first part stays at
 * `manifest.json`, then `manifest/1.json` and so on. `Release.manifest()`
 * joins the parts, so `files` is always complete.
 */
export type ManifestFile = PublishedFile<
  "manifest",
  {
    /** The release ID. */
    readonly release: string;
    /** When it was published, `YYYY-MM-DDTHH:MM:SSZ`. */
    readonly published_at: string;
    /**
     * How many parts the published manifest has, `1` when it is not split;
     * absent before `manifest/2.0`.
     */
    readonly parts?: number;
    /** Every file in the release. */
    readonly files: readonly ManifestEntry[];
    /** How much the release holds. */
    readonly counts: {
      /** Species in the release. */
      readonly species: number;
      /** State results. */
      readonly state_results: number;
      /** County results. */
      readonly county_results: number;
      /** Records counted. */
      readonly records: number;
    };
  }
>;

/** `notes.json`: what changed since the previous release. */
export type NotesFile = PublishedFile<
  "notes",
  {
    /** The release ID. */
    readonly release: string;
    /** The previous release, or `null` for the first one. */
    readonly previous: string | null;
    /** How many results were added, changed and removed. */
    readonly results: {
      /** Results added. */
      readonly added: number;
      /** Results changed. */
      readonly changed: number;
      /** Results removed. */
      readonly removed: number;
    };
    /** Species keys that changed with the taxonomy. */
    readonly key_changes: readonly {
      /** The key before. */
      readonly old: string;
      /** The key now. */
      readonly new: string;
    }[];
    /** Corrections, as short texts. */
    readonly corrections: readonly string[];
    /** Format changes, including a major version carried alongside the old one. */
    readonly formats: readonly {
      /** The format and version. */
      readonly format: string;
      /** What changed. */
      readonly change: string;
      /** When the old version stops, or `null`. */
      readonly until: string | null;
    }[];
  }
>;

/** A species' classification, kingdom to genus, in the shared taxonomy. */
export interface Classification {
  /** The kingdom. */
  readonly kingdom: string | null;
  /** The phylum. */
  readonly phylum: string | null;
  /** The class. */
  readonly class: string | null;
  /** The order. */
  readonly order: string | null;
  /** The family. */
  readonly family: string | null;
  /** The genus. */
  readonly genus: string | null;
}

/** One species in the catalogue. */
export interface CatalogueEntry extends Classification {
  /** The species key in the shared taxonomy. */
  readonly species_key: string;
  /** The scientific name, without authorship. */
  readonly scientific_name: string;
  /** The display name, or `null` when there is none. */
  readonly common_name: string | null;
  /** The taxonomic rank, such as `species`. */
  readonly rank: string;
  /** The browse group, such as `birds`. */
  readonly group: string | null;
  /** The page slug. */
  readonly slug: string | null;
  /** States with a result for this species. */
  readonly states: readonly Area[];
  /**
   * Each state in `states` with its season weeks, exactly as the species file
   * gives them; empty when the species file has none or withholds them.
   * Added in `catalogue/1.1`, so absent from `catalogue/1.0` files.
   */
  readonly seasons?: Readonly<Record<Area, SeasonWeeks>>;
  /**
   * The species' photo, exactly as its species file gives it, or `null`.
   * Added in `catalogue/1.2`, so absent from earlier files.
   */
  readonly photo?: SpeciesPhoto | null;
  /**
   * The states in `states` where the species' records are sensitive because
   * of the species itself (a government list or iNaturalist's location
   * protection). Describes the species, never a location. Added in
   * `catalogue/1.3`, so absent from earlier files.
   */
  readonly sensitive_in?: readonly Area[];
  /**
   * The states in `states` where one of the species' `statuses` listings
   * applies: every state for a federal listing, its own state for a state
   * listing. Added in `catalogue/1.3`, so absent from earlier files.
   */
  readonly listed_in?: readonly Area[];
  /**
   * The states in `states` where one of the species' `introductions`
   * listings applies (the lower 48). Not being listed never means native.
   * Added in `catalogue/1.3`, so absent from earlier files.
   */
  readonly introduced_in?: readonly Area[];
}
/** `catalogue.json` or one of its shards: the species with results. */
export type CatalogueFile = PublishedFile<
  "catalogue",
  {
    /** The species, by scientific name. */
    readonly species: readonly CatalogueEntry[];
  }
>;

/** Season weeks: early, middle and late (5th, 50th and 95th percentiles), or empty. */
export type SeasonWeeks = readonly [number, number, number] | readonly [];

/** `species/<species_key>.json`: one species and every area where it has a result. */
export type SpeciesFile = PublishedFile<
  "species",
  {
    /** The species key in the shared taxonomy. */
    readonly species_key: string;
    /** The scientific name, without authorship. */
    readonly scientific_name: string;
    /** The authorship of the scientific name. */
    readonly authorship: string | null;
    /** The display name, or `null` when there is none. */
    readonly common_name: string | null;
    /** Other scientific names, from the shared taxonomy. */
    readonly synonyms: readonly string[];
    /** The taxonomic rank, such as `species`. */
    readonly rank: string;
    /** Kingdom to genus. */
    readonly classification: Classification;
    /** The browse group, such as `birds`. */
    readonly group: string | null;
    /** The page slug. */
    readonly slug: string | null;
    /** Every area with a result. */
    readonly areas: readonly {
      /** The area code. */
      readonly area: Area;
      /** Whether it is a state or a county. */
      readonly level: Level;
      /** Records counted there. */
      readonly records: number;
      /**
       * How many distinct dates those records fall on; `null` for a species
       * sensitive in the state. Added in `species/1.10`, so absent from
       * earlier files.
       */
      readonly record_dates?: number | null;
      /**
       * The month of the latest of those records, `YYYY-MM`: when people
       * recorded it, never whether it is there now. `null` for a species
       * sensitive in the state. Added in `species/1.10`.
       */
      readonly latest_month?: string | null;
      /** Early, middle and late weeks, or empty. */
      readonly season: SeasonWeeks;
      /** Why `season` is empty, or `null`. */
      readonly season_withheld: Withheld | null;
      /**
       * When `season_withheld` is `two-seasons`, the two windows its records
       * split into (data rules `seasonal.md`); otherwise `null`. Added in
       * `species/1.9`, so absent from earlier files.
       */
      readonly windows?: readonly SeasonWindow[] | null;
      /**
       * Medians over the records the season counts, each on the record's date
       * at its place (ODR-2026-028). Added in `species/1.7`, so absent from
       * earlier files.
       */
      readonly conditions?: Conditions;
      /**
       * For a plant, the result from its records that show flowers
       * (ODR-2026-025); `null` for a species that is not a plant. Added in
       * `species/1.8`, so absent from earlier files.
       */
      readonly flowering?: Flowering | null;
    }[];
    /** Every area within its mapped range. */
    readonly ranges: readonly {
      /** The area code. */
      readonly area: Area;
      /** Whether it is a state or a county. */
      readonly level: Level;
      /** The range's source ID. */
      readonly source: string | null;
      /** The range's seasons there. */
      readonly seasons: readonly RangeSeason[];
    }[];
    /**
     * The species' listings on government lists: the federal Endangered
     * Species Act list and Ohio's lists. Empty when it is on none. Added in
     * `species/1.1`, so absent from `species/1.0` files.
     */
    readonly statuses?: readonly SpeciesListing[];
    /**
     * The species' US-RIIS listings in the lower 48 states: introduced, or
     * introduced and assessed as invasive. Empty when it is not listed, which
     * never means native. Added in `species/1.2`, so absent from earlier files.
     */
    readonly introductions?: readonly SpeciesIntroduction[];
    /**
     * The species' iNaturalist taxon ID, or `null` when it has none. Added in
     * `species/1.3`, so absent from earlier files.
     */
    readonly inaturalist_taxon_id?: number | null;
    /**
     * The species' photo, or `null` when it has none. Added in `species/1.4`,
     * so absent from earlier files.
     */
    readonly photo?: SpeciesPhoto | null;
    /**
     * Per state with a result, the taxa below species that its records were
     * identified to: names only, never counts, never per county. Empty when
     * none of a state's records go below species. Added in `species/1.5`, so
     * absent from earlier files.
     */
    readonly below_species?: readonly BelowSpecies[];
  }
>;

/** A Brand Guide image role that a photo is cut to. */
export type PhotoRole =
  "hero" | "feature" | "species" | "card" | "thumb" | "social";

/**
 * A species photo from iNaturalist, copied to OpenPhenology's own storage.
 * Its files are at `photos/<role>/<id>-<width>.<format>` from the API root.
 * It keeps its own licence and credit, not the release's.
 */
export interface SpeciesPhoto {
  /** `inat-` and the iNaturalist photo ID. */
  readonly id: string;
  /** Where it was chosen from: the default photo, a taxon photo, or an observation photo. */
  readonly source: "default" | "taxon" | "observation";
  /** Per role the photo was cut to, the widths made, smallest first. */
  readonly sizes: Readonly<Partial<Record<PhotoRole, readonly number[]>>>;
  /** The credit iNaturalist gives, word for word; show it with the photo. */
  readonly credit: string;
  /** The licence's SPDX identifier, such as `CC-BY-NC-4.0`, or `CC0-1.0` or `PDM`. */
  readonly licence: string;
  /** The licence's address. */
  readonly licence_url: string;
  /** The photo's page on iNaturalist. */
  readonly url: string;
}

/** The taxa below species that one state's records of a species were identified to. */
export interface BelowSpecies {
  /** The state's code. */
  readonly area: Area;
  /** Each subspecies, variety or form with at least 5 of the state's records, by scientific name. */
  readonly taxa: readonly {
    /** The taxon key in the shared taxonomy. */
    readonly taxon_key: string;
    /** The scientific name, with its rank marker, such as `subsp.`. */
    readonly scientific_name: string;
    /** The rank. */
    readonly rank: "subspecies" | "variety" | "form";
    /** The display name, or `null`. */
    readonly common_name: string | null;
  }[];
  /** True when other records went below species but their taxon is not listed. */
  readonly other_below_species: boolean;
}

/** One listing of a species, or of a subspecies or variety of it, on a government list. */
export interface SpeciesListing {
  /** The list: `usfws` (US Fish & Wildlife Service, Endangered Species Act) or `ohio`. */
  readonly list: "usfws" | "ohio";
  /** Where the list applies: `us` for the federal list, a state code for a state list. */
  readonly place: string;
  /** The scientific name the list gives; it shows when only a subspecies or variety is listed. */
  readonly listed_name: string;
  /** The status, as the list writes it, such as `Endangered`. */
  readonly status: string;
  /** The federal list's own description of where the listing applies, such as `Wherever found`; `null` for a state list. */
  readonly where: string | null;
  /**
   * The list as the site names it, such as `Ohio's list of endangered and
   * threatened wild animals`. Added in `species/1.6`, so absent from earlier
   * files.
   */
  readonly list_name?: string;
  /** Who keeps the list, such as `Ohio Division of Wildlife`. Added in `species/1.6`. */
  readonly keeper?: string;
  /**
   * The edition used: the month the federal list was read, such as
   * `October 2026`, or the state list's own edition, such as `June 2026`.
   * Added in `species/1.6`.
   */
  readonly edition?: string;
}

/**
 * A plant's flowering result in one area (data rules `seasonal.md`, Flowering
 * results): when people recorded it with flowers showing and annotated, not
 * when it flowers. Pages say "reported in flower" and name the middle week,
 * never a peak.
 */
export interface Flowering {
  /** Records that show flowers, counted there. */
  readonly records: number;
  /** Early, middle and late weeks, or empty. */
  readonly season: SeasonWeeks;
  /** Why `season` is empty, or `null`. */
  readonly season_withheld: FloweringWithheld | null;
  /** Its two windows when it is `two-seasons`, or `null`. Added in `species/1.9`. */
  readonly windows?: readonly SeasonWindow[] | null;
}

/**
 * One of a two-season result's windows (data rules `seasonal.md`, Two
 * windows): when people recorded the species in that part of the year, never
 * why there are two.
 */
export interface SeasonWindow {
  /** The window's records. */
  readonly records: number;
  /** Early, middle and late weeks, or empty. */
  readonly season: SeasonWeeks;
  /** Why `season` is empty, or `null`. */
  readonly season_withheld: FloweringWithheld | null;
}

/**
 * The medians over a result's records, each on the record's date at its place
 * (data rules `formats.md`). A value is `null` when fewer records than the
 * method's minimum have it.
 */
export interface Conditions {
  /** Median sunrise, local clock time `HH:MM`, calculated with NOAA's solar calculation. */
  readonly sunrise: string | null;
  /** Median sunset, local clock time `HH:MM`, calculated with NOAA's solar calculation. */
  readonly sunset: string | null;
  /** Median daily high in °C, from NOAA nClimGrid-Daily; lower 48 states only. */
  readonly high: number | null;
  /** Median daily low in °C, from NOAA nClimGrid-Daily; lower 48 states only. */
  readonly low: number | null;
  /**
   * Median midpoint of the day's high and low in °C (NOAA's `tavg`); not an
   * average of temperatures through the day. Lower 48 states only.
   */
  readonly midpoint: number | null;
}

/** One US-RIIS listing of a species, or of a subspecies or variety of it. */
export interface SpeciesIntroduction {
  /** The list: US-RIIS ver. 2.0, conterminous 48 states. */
  readonly source: "us-riis-l48-v2";
  /** Where the listing applies: the 48 conterminous states and DC. */
  readonly region: "us-l48";
  /** The scientific name the list gives; it shows when only a subspecies or variety is listed. */
  readonly listed_name: string;
  /** `introduced`, or `invasive`: causing, or likely to cause, harm there. */
  readonly status: "introduced" | "invasive";
}

/** `slugs.json`: species page slugs and redirects. */
export type SlugsFile = PublishedFile<
  "slugs",
  {
    /** Slug to species key. */
    readonly species: Readonly<Record<string, string>>;
    /** Old slug to current slug. */
    readonly redirects: Readonly<Record<string, string>>;
  }
>;

/** `groups.json`: the browse groups. */
export type GroupsFile = PublishedFile<
  "groups",
  {
    /** The groups, in display order. */
    readonly groups: readonly {
      /** The group's key, such as `birds`. */
      readonly group: string;
      /** Its display name, such as `Birds`. */
      readonly name: string;
      /** The taxon keys that place a species in it. */
      readonly taxa: readonly string[];
      /** Species in it with a result. */
      readonly species: number;
    }[];
  }
>;

/** One searchable name: the name, what kind it is, and its species key. */
export type SearchName = readonly [
  string,
  "scientific" | "common" | "other-name" | "synonym",
  string,
];
/** `search/index.json` or one of its shards: every name, for search on the device. */
export type SearchFile = PublishedFile<
  "search",
  {
    /** Every searchable name. */
    readonly names: readonly SearchName[];
  }
>;

/** A state or county in a region file. */
export interface RegionArea {
  /** The area code. */
  readonly area: Area;
  /** Whether it is a state or a county. */
  readonly level: Level;
  /** Its name, such as `Franklin`. */
  readonly name: string;
  /** Its page slug. */
  readonly slug: string;
  /** Species with a result there. */
  readonly species_keys: readonly string[];
  /** Species whose mapped range covers it. */
  readonly range_species_keys: readonly string[];
  /** Records of all species counted in the area, weeks 1 to 53. */
  readonly effort: readonly number[];
}
/** `regions/<state>.json`: a state, its counties, their species and effort. */
export type RegionFile = PublishedFile<
  "region",
  {
    /** The state code. */
    readonly state: Area;
    /** The state's name. */
    readonly name: string;
    /** The state's page slug. */
    readonly slug: string;
    /** The state, then each of its counties. */
    readonly areas: readonly RegionArea[];
  }
>;

/**
 * The phenology result for one species in one county or state. It shows when
 * people recorded the species, not when or where it occurs: see `limits`.
 */
export interface WeeklyResult {
  /** The area code. */
  readonly area: Area;
  /** The species key. */
  readonly species_key: string;
  /** Records counted, over all weeks. */
  readonly included_records: number;
  /** Calendar years with at least one counted record. */
  readonly contributing_years: number;
  /** The minimum records and years the method requires. */
  readonly thresholds: {
    /** Minimum records. */
    readonly records: number;
    /** Minimum years. */
    readonly years: number;
  };
  /** Records counted and years contributing, each for weeks 1 to 53. */
  readonly weekly: {
    /** Records counted, weeks 1 to 53. */
    readonly records: readonly number[];
    /** Years contributing, weeks 1 to 53. */
    readonly years: readonly number[];
  };
  /** Early, middle and late weeks, or empty when withheld. */
  readonly season: SeasonWeeks;
  /** Why `season` is empty, or `null`. */
  readonly season_withheld: Withheld | null;
  /** Records of all species counted in the area, weeks 1 to 53. */
  readonly effort: readonly number[];
  /** What the result does not show. */
  readonly limits: string;
}
/** `results/<state>/<county>/<species_key>.json`: a county result. */
export type CountyResultFile = PublishedFile<"county-weekly", WeeklyResult>;
/** `results/<state>/<species_key>.json`: a state result. */
export type StateResultFile = PublishedFile<"state-weekly", WeeklyResult>;

/** `attribution/<state>/[<county>/]<species_key>.json`: the sources behind a result. */
export type AttributionFile = PublishedFile<
  "attribution",
  {
    /** The area code. */
    readonly area: Area;
    /** The species key. */
    readonly species_key: string;
    /** Each dataset the records came from. */
    readonly datasets: readonly {
      /** The dataset's key. */
      readonly dataset_key: string;
      /** Its title. */
      readonly title: string | null;
      /** Its publisher. */
      readonly publisher: string | null;
      /** How to cite it. */
      readonly citation: string | null;
      /** Its page. */
      readonly url: string | null;
      /** Records it contributed. */
      readonly records: number;
    }[];
    /** The GBIF downloads the records came from, as DOIs. */
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
/** `backyard/<state>/<county>.json`: a county's Backyard labels. */
export type BackyardFile = PublishedFile<
  "backyard",
  {
    /** The county's 5-digit Census code. */
    readonly area: Area;
    /** The method version. */
    readonly method: string;
    /** The latest record date counted, `YYYY-MM-DD`. */
    readonly evidence_through: string | null;
    /** Records of all species counted in the county, weeks 1 to 53. */
    readonly effort: readonly number[];
    /** Each species with a result or a mapped range covering the county. */
    readonly species: readonly {
      /** The species key. */
      readonly species_key: string;
      /** The browse group. */
      readonly group: string | null;
      /** 53 letters, one per week. */
      readonly labels: string;
      /** The mapped range covering the county, or `null`. */
      readonly range: {
        /** The range's source ID. */
        readonly source: string | null;
        /** The range's seasons there. */
        readonly seasons: readonly RangeSeason[];
      } | null;
      /**
       * The county result's records counted, or `null` without a county
       * result. Added in `backyard/1.1`, so absent from `backyard/1.0` files.
       */
      readonly records?: number | null;
      /**
       * The county result's weekly records, weeks 1 to 53, or `null` without
       * a county result. Added in `backyard/1.1`.
       */
      readonly weekly?: readonly number[] | null;
      /** The county result's season weeks, or empty. Added in `backyard/1.1`. */
      readonly season?: SeasonWeeks;
      /** Why the county result's season is withheld, or `null`. Added in `backyard/1.1`. */
      readonly season_withheld?: Withheld | null;
    }[];
  }
>;

/** `methods.json`: how results are made. */
export type MethodsFile = PublishedFile<
  "methods",
  {
    /** The method version. */
    readonly method: string;
    /** The data rules version. */
    readonly data_rules: string;
    /** Every number the method uses, by name. */
    readonly thresholds: Readonly<Record<string, unknown>>;
    /** How weeks are counted. */
    readonly weeks: string;
    /** The first date records are pooled from. */
    readonly pooled_from: string;
    /** The taxonomy version. */
    readonly taxonomy: string;
    /** The boundary version. */
    readonly boundaries: string;
    /** The version of each sensitive-species list, by list. */
    readonly protection: Readonly<Record<string, string>>;
    /** Each mapped range edition. */
    readonly ranges: readonly string[];
    /** What results do not show. */
    readonly limits: string;
  }
>;

/** `sources.json`: each source, its licence and how to credit it. */
export type SourcesFile = PublishedFile<
  "sources",
  {
    /** Each source. */
    readonly sources: readonly {
      /** The source ID. */
      readonly source: string;
      /** Its name. */
      readonly name: string;
      /** What kind of source it is. */
      readonly kind: string;
      /** Its licence. */
      readonly licence: string;
      /** Where its licence is published. */
      readonly licence_url: string | null;
      /** What OpenPhenology uses it for. */
      readonly use: string;
      /** When its use was last reviewed, `YYYY-MM-DD`. */
      readonly reviewed: string;
      /** How to credit it. */
      readonly credit: string;
      /** Its home page. */
      readonly url: string;
    }[];
  }
>;

/** County outlines for maps, as a GeoJSON FeatureCollection. Display only. */
export type BoundariesFile = PublishedFile<
  "boundaries",
  {
    /** Always `FeatureCollection`. */
    readonly type: "FeatureCollection";
    /** One feature per county. */
    readonly features: readonly {
      /** Always `Feature`. */
      readonly type: "Feature";
      /** The county. */
      readonly properties: {
        /** The county's 5-digit Census code. */
        readonly area: Area;
        /** Its name. */
        readonly name: string;
        /** Its page slug. */
        readonly slug: string;
      };
      /** Its outline, WGS 84 longitude and latitude. */
      readonly geometry: {
        /** Always `MultiPolygon`. */
        readonly type: "MultiPolygon";
        /** Polygons of rings of `[longitude, latitude]` positions. */
        readonly coordinates: readonly (readonly (readonly (readonly number[])[])[])[];
      };
    }[];
  }
>;

/** `postal/us/<prefix>.json`: ZIP codes with that 3-digit prefix, and their counties. */
export type PostalFile = PublishedFile<
  "postal",
  {
    /** ZIP code to its counties, each with the share of its land. */
    readonly zips: Readonly<
      Record<string, readonly (readonly [Area, number])[]>
    >;
  }
>;
