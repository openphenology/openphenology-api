// The source of the JSON Schemas in this folder. `pnpm schemas` writes them as
// `<kind>-<major>.json`; `pnpm schemas:check` fails when the files are out of
// date.
import type {
  AttributionFile,
  BackyardFile,
  BoundariesFile,
  CitiesFile,
  CatalogueFile,
  CountyResultFile,
  CurrentFile,
  GroupsFile,
  ManifestFile,
  MethodsFile,
  NotesFile,
  PlaceBoundariesFile,
  PlaceLabelsFile,
  PlaceResultFile,
  PlacesFile,
  PostalFile,
  RegionFile,
  ReleasesFile,
  SearchFile,
  SlugsFile,
  SourcesFile,
  SpeciesFile,
  StateResultFile,
  TermsFile,
} from "../src/types.ts";

export type Kind = (
  | AttributionFile
  | BackyardFile
  | BoundariesFile
  | CatalogueFile
  | CitiesFile
  | CountyResultFile
  | CurrentFile
  | GroupsFile
  | ManifestFile
  | MethodsFile
  | NotesFile
  | PlaceBoundariesFile
  | PlaceLabelsFile
  | PlaceResultFile
  | PlacesFile
  | PostalFile
  | RegionFile
  | ReleasesFile
  | SearchFile
  | SlugsFile
  | SourcesFile
  | SpeciesFile
  | StateResultFile
  | TermsFile
)["kind"];

export type Schema = Readonly<Record<string, unknown>>;

/**
 * The major format version these schemas describe, by kind: 1, except
 * `manifest/2.0` (data rules 1.30), which may be split into parts, and
 * `attribution/2.0` (data rules 1.76), with compact record links.
 */
export const majorOf = (kind: string): number =>
  kind === "manifest" || kind === "attribution" ? 2 : 1;

const string: Schema = { type: "string" };
const text: Schema = { type: "string", minLength: 1 };
const nullable = (schema: Schema): Schema => ({
  anyOf: [schema, { type: "null" }],
});
const list = (items: Schema, extra: Schema = {}): Schema => ({
  type: "array",
  items,
  ...extra,
});
const tuple = (...items: Schema[]): Schema => ({
  type: "array",
  prefixItems: items,
  items: false,
  minItems: items.length,
});
const pattern = (regex: string): Schema => ({ type: "string", pattern: regex });

/** An object with every listed field required; unknown fields are allowed, as a minor version can add them. */
const object = (properties: Record<string, Schema>, ...rules: Schema[]) => ({
  type: "object",
  required: Object.keys(properties),
  properties,
  ...(rules.length > 0 ? { allOf: rules } : {}),
});

const date = pattern("^\\d{4}-\\d{2}-\\d{2}$");
/** A local clock time, `HH:MM` on a 24-hour clock. */
const clock = pattern("^([01]\\d|2[0-3]):[0-5]\\d$");
/** A month and day, `MM-DD`. */
const monthDay = pattern("^(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$");
/** A temperature in °C, to one decimal. */
const celsius: Schema = { type: "number" };
const percent: Schema = { type: "number", minimum: 0, maximum: 100 };
const time = pattern("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$");
const STATE = "[a-z]{2}-[a-z0-9]{1,3}";
const COUNTY = "\\d{5}";
const KEY = "[A-Za-z0-9._-]+";
/** The address slug in a park's or metro park system's code. */
const SLUG = "[a-z0-9]+(-[a-z0-9]+)*";
/** A place's area code (formats.md 1.29): a watershed, ecoregion, park or metro park system. */
const PLACE = `(huc8-\\d{8}|eco-\\d+|parks?-${SLUG})`;
const state = pattern(`^${STATE}$`);
/** A country other than the United States, lowercase ISO 3166-1 alpha-2 (places/1.1). */
const country = pattern("^(?!us$)[a-z]{2}$");
const county = pattern(`^${COUNTY}$`);
const watershed = pattern("^huc8-\\d{8}$");
const ecoregion = pattern("^eco-\\d+$");
const park = pattern(`^park-${SLUG}$`);
const parkSystem = pattern(`^parks-${SLUG}$`);
const place = pattern(`^${PLACE}$`);
const area: Schema = { anyOf: [state, county, place] };
/** The kinds of place (species/1.16). */
const PLACE_LEVELS = ["watershed", "ecoregion", "park", "park-system"] as const;
const speciesKey = pattern(`^${KEY}$`);
const slug = pattern("^[a-z0-9]+(-[a-z0-9]+)*$");
const group = pattern("^[a-z]+(-[a-z]+)*$");
const count: Schema = { type: "integer", minimum: 0 };
const week: Schema = { type: "integer", minimum: 1, maximum: 53 };
const weekly = list(count, { minItems: 53, maxItems: 53 });
const rangeSeasons = list({
  enum: ["year-round", "summer", "winter", "migratory", "passage"],
});
/** A species photo (formats.md 1.8): its sizes per Brand Guide role, credit and licence. */
const photo: Schema = nullable(
  object({
    id: pattern("^inat-\\d+$"),
    source: { enum: ["default", "taxon", "observation"] },
    sizes: {
      type: "object",
      propertyNames: {
        enum: ["hero", "feature", "species", "card", "thumb", "social"],
      },
      additionalProperties: list(
        { type: "integer", minimum: 1 },
        { minItems: 1 },
      ),
    },
    credit: text,
    licence: text,
    licence_url: text,
    url: text,
  }),
);
/** The taxa below species that a state's records were identified to (formats.md 1.9). */
const belowSpecies = list(
  object({
    area: state,
    taxa: list(
      object({
        taxon_key: speciesKey,
        scientific_name: text,
        rank: { enum: ["subspecies", "variety", "form"] },
        common_name: nullable(text),
      }),
    ),
    other_below_species: { type: "boolean" },
  }),
);

/**
 * `area` is a state code when `level` is `state`, a county's 5-digit Census
 * code when it is `county`, and the matching place code for a place:
 * `huc8-` for a watershed, `eco-` for an ecoregion, `park-` for a park and
 * `parks-` for a metro park system.
 */
const areaMatchesLevel: Schema = {
  anyOf: (
    [
      ["state", state],
      ["county", county],
      ["watershed", watershed],
      ["ecoregion", ecoregion],
      ["park", park],
      ["park-system", parkSystem],
    ] as const
  ).map(([level, code]) => ({
    type: "object",
    properties: { level: { const: level }, area: code },
  })),
};

/** `season` is three weeks with no reason withheld, or empty with the reason. */
const seasonMatchesWithheld: Schema = {
  anyOf: [
    {
      type: "object",
      properties: {
        season: { type: "array", minItems: 3 },
        season_withheld: { type: "null" },
      },
    },
    {
      type: "object",
      properties: {
        season: { type: "array", maxItems: 0 },
        season_withheld: {
          enum: ["year-round", "two-seasons", "one-year", "precision"],
        },
      },
    },
  ],
};
/** A flowering result's or window's season, or its reason, which may be too few records. */
const floweringMatchesWithheld: Schema = {
  anyOf: [
    {
      type: "object",
      properties: {
        season: { type: "array", minItems: 3 },
        season_withheld: { type: "null" },
      },
    },
    {
      type: "object",
      properties: {
        season: { type: "array", maxItems: 0 },
        season_withheld: {
          enum: [
            "too-few-records",
            "year-round",
            "two-seasons",
            "one-year",
            "precision",
          ],
        },
      },
    },
  ],
};
/** `format` is null for `archive.tar.gz`, the one file that is not JSON, and only for it. */
const archiveHasNoFormat: Schema = {
  anyOf: [
    {
      type: "object",
      properties: {
        path: { const: "archive.tar.gz" },
        format: { type: "null" },
      },
    },
    {
      type: "object",
      properties: {
        path: { not: { const: "archive.tar.gz" } },
        format: { type: "string" },
      },
    },
  ],
};
const season = list(week, { maxItems: 3 });
/** A calendar month, `YYYY-MM`. */
const month = pattern("^\\d{4}-(0[1-9]|1[0-2])$");
const seasonWithheld = nullable({
  enum: ["year-round", "two-seasons", "one-year", "precision"],
});
/** A reason a flowering result or a window has no season weeks. */
const windowWithheld = nullable({
  enum: [
    "too-few-records",
    "year-round",
    "two-seasons",
    "one-year",
    "precision",
  ],
});
/** Only a result withheld as `two-seasons` has windows. */
const windowsOnlyForTwoSeasons: Schema = {
  if: {
    type: "object",
    required: ["windows"],
    properties: { windows: { type: "array" } },
  },
  then: { properties: { season_withheld: { const: "two-seasons" } } },
};
/** Medians on a result's record days (ODR-2026-028). */
const conditions: Schema = object({
  sunrise: nullable(clock),
  sunset: nullable(clock),
  high: nullable(celsius),
  low: nullable(celsius),
  midpoint: nullable(celsius),
});

/** A two-season result's two windows (data rules `seasonal.md`), or null. */
const windows: Schema = nullable(
  list(
    object(
      { records: count, season, season_withheld: windowWithheld },
      floweringMatchesWithheld,
    ),
    { minItems: 2, maxItems: 2 },
  ),
);

/**
 * A flowering, fruiting, adult or larva result (data rules `seasonal.md`):
 * the season method on the records that show the stage, or `null` where the
 * stage does not apply. `windows` was added in species/1.9.
 */
/** The kinds of sign in Evidence of Presence results (formats.md 1.28). */
const SIGNS = [
  "feather",
  "scat",
  "track",
  "bone",
  "molt",
  "gall",
  "egg",
  "hair",
  "leaf-mine",
  "construction",
] as const;
/** Record counts for hours 0 to 23 of local time (species/1.15). */
const hours24 = list(count, { minItems: 24, maxItems: 24 });
const stageResult: Schema = nullable({
  ...object(
    {
      records: count,
      season,
      season_withheld: windowWithheld,
    },
    floweringMatchesWithheld,
    windowsOnlyForTwoSeasons,
  ),
  properties: {
    records: count,
    season,
    season_withheld: windowWithheld,
    windows,
  },
});
/** A sign's result: as a stage result, never null (species/1.15). */
const signResult: Schema = (stageResult.anyOf as Schema[])[0] as Schema;
/** The heard result: a stage result with its hours (species/1.15). */
const heardResult: Schema = nullable({
  ...signResult,
  properties: {
    ...(signResult.properties as Record<string, Schema>),
    hours: nullable(hours24),
  },
});
/** Land cover at a state result's records (species/1.15). */
const recordLandCover: Schema = nullable(
  object({
    records: count,
    groups: list(
      object({
        group: {
          enum: [
            "forest",
            "farmland",
            "developed",
            "wetland",
            "grassland-shrub",
            "barren",
            "water",
          ],
        },
        share: percent,
      }),
    ),
  }),
);
/** Up to 5 look-alikes in a state (species/1.15). */
const lookAlikes: Schema = nullable(
  list(
    object({
      species_key: speciesKey,
      state: count,
      worldwide: count,
      chosen_by: { enum: ["state", "worldwide"] },
    }),
    { maxItems: 5 },
  ),
);

const classification = {
  kingdom: nullable(string),
  phylum: nullable(string),
  class: nullable(string),
  order: nullable(string),
  family: nullable(string),
  genus: nullable(string),
};

const provenance = object({
  release: date,
  sources: list(string),
  licences: list(string),
  gbif_download_dois: list(string),
  method: nullable(string),
  taxonomy: nullable(string),
  boundaries: nullable(string),
  ranges: nullable(list(string)),
  protection: nullable({ type: "object", additionalProperties: string }),
  code: nullable(string),
  run: nullable(string),
});

const weeklyResult = (where: Schema) =>
  object(
    {
      area: where,
      species_key: speciesKey,
      included_records: count,
      contributing_years: count,
      thresholds: object({ records: count, years: count }),
      weekly: object({ records: weekly, years: weekly }),
      season,
      season_withheld: seasonWithheld,
      effort: weekly,
      limits: text,
    },
    seasonMatchesWithheld,
  );

/** Adds file-level rules to a schema. */
const withRules = (schema: Schema, ...rules: Schema[]): Schema => ({
  ...schema,
  allOf: rules,
});

/** Adds fields that a later minor version requires and earlier ones lack. */
const withOptional = (
  schema: Schema,
  properties: Record<string, Schema>,
): Schema => ({
  ...schema,
  properties: {
    ...(schema.properties as Record<string, Schema>),
    ...properties,
  },
});

/**
 * From minor version `minor` on, each item of the named `data` lists requires
 * the given fields, which `withOptional` added. Earlier minors are exempt.
 */
const sinceMinor = (
  kind: Kind,
  minor: number,
  lists: Record<string, readonly string[]>,
): Schema => ({
  if: {
    type: "object",
    properties: {
      format: {
        enum: Array.from(
          { length: minor },
          (_, earlier) => `${kind}/${String(majorOf(kind))}.${String(earlier)}`,
        ),
      },
    },
  },
  else: {
    type: "object",
    properties: {
      data: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(lists).map(([name, fields]) => [
            name,
            {
              type: "array",
              items: {
                type: "object",
                properties: Object.fromEntries(fields.map((f) => [f, true])),
                required: fields,
              },
            },
          ]),
        ),
      },
    },
  },
});

/**
 * From minor version `minor` on, `data` requires the given fields, which
 * `withOptional` added. Earlier minors are exempt.
 */
const sinceMinorData = (
  kind: Kind,
  minor: number,
  fields: readonly string[],
): Schema => ({
  if: {
    type: "object",
    properties: {
      format: {
        enum: Array.from(
          { length: minor },
          (_, earlier) => `${kind}/${String(majorOf(kind))}.${String(earlier)}`,
        ),
      },
    },
  },
  else: {
    type: "object",
    properties: {
      data: {
        type: "object",
        properties: Object.fromEntries(fields.map((f) => [f, true])),
        required: fields,
      },
    },
  },
});

/** A GeoJSON position, `[longitude, latitude]` in WGS 84. */
const position = tuple(
  { type: "number", minimum: -180, maximum: 180 },
  { type: "number", minimum: -90, maximum: 90 },
);
/** A GeoJSON MultiPolygon: polygons of closed rings of positions. */
const multiPolygon = object({
  type: { const: "MultiPolygon" },
  coordinates: list(list(list(position, { minItems: 4 }), { minItems: 1 }), {
    minItems: 1,
  }),
});

/** A place's fields that depend on its level (formats.md 1.29, Places). */
const placeMatchesLevel: Schema = {
  anyOf: [
    {
      type: "object",
      properties: {
        level: { const: "watershed" },
        code: pattern("^\\d{8}$"),
        best_weeks: { type: "null" },
        park: { type: "null" },
      },
    },
    {
      type: "object",
      properties: {
        level: { const: "ecoregion" },
        code: { type: "integer", minimum: 1 },
        best_weeks: { type: "null" },
        park: { type: "null" },
      },
    },
    {
      type: "object",
      properties: {
        level: { const: "park" },
        code: { type: "null" },
        continues_into_countries: { type: "array", maxItems: 0 },
        park: {
          type: "object",
          properties: {
            type: { enum: ["national", "state"] },
            acres: { type: "number" },
            parks: { type: "array", maxItems: 0 },
          },
        },
      },
    },
    {
      type: "object",
      properties: {
        level: { const: "park-system" },
        code: { type: "null" },
        continues_into_countries: { type: "array", maxItems: 0 },
        park: {
          type: "object",
          properties: {
            type: { const: "park-system" },
            acres: { type: "null" },
          },
        },
      },
    },
  ],
};
/** A park with a page has at least 5 species with a result (data rules 1.74); one without has none listed. */
const pageMatchesSpecies = (hasPage: boolean, keys: Schema): Schema => ({
  if: {
    type: "object",
    required: ["park"],
    properties: {
      park: {
        type: "object",
        required: ["has_page"],
        properties: { has_page: { const: hasPage } },
      },
    },
  },
  then: { type: "object", properties: { species_keys: keys } },
});
/** Each place in `places/<kind>.json` is of that kind. */
const placesMatchKind: Schema = {
  anyOf: (
    [
      ["watersheds", ["watershed"]],
      ["ecoregions", ["ecoregion"]],
      ["parks", ["park", "park-system"]],
    ] as const
  ).map(([kind, levels]) => ({
    type: "object",
    properties: {
      kind: { const: kind },
      places: {
        type: "array",
        items: {
          type: "object",
          properties: { level: { enum: [...levels] } },
        },
      },
    },
  })),
};
/** Outlines for watersheds and ecoregions, points for parks, and `system` only for parks. */
const geometryMatchesArea: Schema = {
  anyOf: [
    {
      type: "object",
      properties: {
        properties: {
          type: "object",
          properties: {
            area: { anyOf: [watershed, ecoregion] },
            system: { type: "null" },
          },
        },
        geometry: {
          type: "object",
          properties: { type: { const: "MultiPolygon" } },
        },
      },
    },
    {
      type: "object",
      properties: {
        properties: {
          type: "object",
          properties: { area: { anyOf: [park, parkSystem] } },
        },
        geometry: { type: "object", properties: { type: { const: "Point" } } },
      },
    },
  ],
};

/** Each file's path from the API root, without `.json`. */
const RELEASE = "releases/\\d{4}-\\d{2}-\\d{2}/";
const paths: Record<Kind, string> = {
  current: "current",
  releases: "releases",
  terms: "terms",
  manifest: `${RELEASE}manifest`,
  notes: `${RELEASE}notes`,
  catalogue: `${RELEASE}catalogue`,
  species: `${RELEASE}species/${KEY}`,
  slugs: `${RELEASE}slugs`,
  groups: `${RELEASE}groups`,
  search: `${RELEASE}search/index`,
  region: `${RELEASE}regions/${STATE}`,
  "state-weekly": `${RELEASE}results/${STATE}/${KEY}`,
  "county-weekly": `${RELEASE}results/${STATE}/${COUNTY}/${KEY}`,
  attribution: `${RELEASE}attribution/(${STATE}(/${COUNTY})?|places/${PLACE})/${KEY}`,
  backyard: `${RELEASE}backyard/${STATE}/${COUNTY}`,
  methods: `${RELEASE}methods`,
  sources: `${RELEASE}sources`,
  boundaries: `${RELEASE}places/${STATE}/boundaries`,
  cities: `${RELEASE}places/${STATE}/cities`,
  places: `${RELEASE}places/(watersheds|ecoregions|parks)`,
  "place-boundaries": `${RELEASE}places/(watersheds|ecoregions|parks)/boundaries`,
  "place-weekly": `${RELEASE}results/places/${PLACE}/${KEY}`,
  "place-labels": `${RELEASE}labels/${PLACE}`,
  postal: `${RELEASE}postal/us/\\d{3}`,
};

/** Wraps a format's `data` in the fields every published file shares. */
const file = (kind: Kind, description: string, data: Schema): Schema => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: `OpenPhenology ${kind}/${String(majorOf(kind))}`,
  description,
  ...object({
    // The file's path; a shard of `<name>.json` is `<name>/<n>.json`.
    id: pattern(`^${paths[kind]}(/\\d+)?\\.json$`),
    kind: { const: kind },
    format: pattern(`^${kind}/${String(majorOf(kind))}\\.\\d+$`),
    provenance,
    data,
  }),
});

/** One schema per published file format, by kind. */
/**
 * An area's stage seasons (ODR-2026-037): per stage the species has there,
 * its season exactly as the species file gives it, empty when withheld.
 */
const stageSeasonWeeks: Schema = {
  ...season,
  anyOf: [
    { type: "array", maxItems: 0 },
    { type: "array", minItems: 3 },
  ],
};
const stageSeasons: Schema = {
  type: "object",
  properties: {
    flowering: stageSeasonWeeks,
    fruiting: stageSeasonWeeks,
    adult: stageSeasonWeeks,
    larva: stageSeasonWeeks,
  },
  additionalProperties: false,
};

export const schemas = {
  current: file(
    "current",
    "The current release.",
    object({ release: date, published_at: time }),
  ),

  releases: file(
    "releases",
    "Every release and its status.",
    object({
      releases: list(
        object({
          release: date,
          status: { enum: ["current", "available", "withdrawn"] },
          published_at: time,
          doi: nullable(string),
          builds_on: nullable(string),
          reason: nullable(string),
        }),
      ),
    }),
  ),

  terms: withRules(
    file(
      "terms",
      "The licence, what it covers, how to cite and credit, and the contact.",
      withOptional(
        object({
          licence: text,
          licence_url: text,
          cite: text,
          credit: text,
          warranty: text,
          contact: text,
        }),
        { scope: text },
      ),
    ),
    sinceMinorData("terms", 1, ["scope"]),
  ),

  manifest: withRules(
    file(
      "manifest",
      "Every file in a release, with its SHA-256, size and format. A large manifest is split on `files`: its first part is always `manifest.json`, then `manifest/1.json` and so on.",
      object({
        release: date,
        published_at: time,
        parts: { type: "integer", minimum: 1 },
        files: list(
          object(
            {
              path: text,
              format: nullable(pattern("^[a-z]+(-[a-z]+)*/\\d+\\.\\d+$")),
              sha256: pattern("^[0-9a-f]{64}$"),
              bytes: count,
            },
            archiveHasNoFormat,
          ),
        ),
        counts: {
          ...object({
            species: count,
            state_results: count,
            county_results: count,
            records: count,
          }),
          // Optional: added in manifest/2.1, so absent from manifest/2.0.
          properties: {
            species: count,
            state_results: count,
            county_results: count,
            place_results: count,
            records: count,
          },
        },
      }),
    ),
    // counts.place_results is required from manifest/2.1.
    {
      if: {
        type: "object",
        properties: { format: { const: "manifest/2.0" } },
      },
      else: {
        type: "object",
        properties: {
          data: {
            type: "object",
            properties: {
              counts: {
                type: "object",
                properties: { place_results: true },
                required: ["place_results"],
              },
            },
          },
        },
      },
    },
  ),

  notes: file(
    "notes",
    "What changed since the previous release.",
    object({
      release: date,
      previous: nullable(date),
      results: object({ added: count, changed: count, removed: count }),
      key_changes: list(object({ old: speciesKey, new: speciesKey })),
      corrections: list(text),
      formats: list(
        object({ format: text, change: text, until: nullable(date) }),
      ),
    }),
  ),

  catalogue: withRules(
    file(
      "catalogue",
      "Species with a result or a mapped range, by scientific name. May be split into shards.",
      object({
        species: list(
          withOptional(
            object({
              species_key: speciesKey,
              scientific_name: text,
              common_name: nullable(text),
              rank: text,
              ...classification,
              group: nullable(group),
              slug: nullable(slug),
              states: list(state),
            }),
            {
              photo,
              sensitive_in: list(state),
              protection_unconfirmed_in: list(state),
              listed_in: list(state),
              introduced_in: list(state),
              invasive_in: list(state),
              stage_seasons: {
                type: "object",
                propertyNames: state,
                additionalProperties: stageSeasons,
              },
              windows: {
                type: "object",
                propertyNames: state,
                additionalProperties: windows,
              },
              conditions: {
                type: "object",
                propertyNames: state,
                additionalProperties: conditions,
              },
              seasons: {
                type: "object",
                propertyNames: state,
                additionalProperties: {
                  ...season,
                  anyOf: [
                    { type: "array", maxItems: 0 },
                    { type: "array", minItems: 3 },
                  ],
                },
              },
            },
          ),
        ),
      }),
    ),
    sinceMinor("catalogue", 1, { species: ["seasons"] }),
    sinceMinor("catalogue", 2, { species: ["photo"] }),
    sinceMinor("catalogue", 3, {
      species: ["sensitive_in", "listed_in", "introduced_in"],
    }),
    sinceMinor("catalogue", 4, { species: ["stage_seasons", "invasive_in"] }),
    sinceMinor("catalogue", 5, { species: ["protection_unconfirmed_in"] }),
    sinceMinor("catalogue", 7, { species: ["windows", "conditions"] }),
  ),

  species: withRules(
    file(
      "species",
      "One species and every area with a result or within its mapped range.",
      withOptional(
        object({
          species_key: speciesKey,
          scientific_name: text,
          authorship: nullable(text),
          common_name: nullable(text),
          synonyms: list(text),
          rank: text,
          classification: object(classification),
          group: nullable(group),
          slug: nullable(slug),
          areas: list({
            ...object(
              {
                area,
                level: { enum: ["state", "county", ...PLACE_LEVELS] },
                records: count,
                season,
                season_withheld: seasonWithheld,
              },
              areaMatchesLevel,
              seasonMatchesWithheld,
              windowsOnlyForTwoSeasons,
            ),
            // Optional: `conditions` added in species/1.7, `flowering` in
            // species/1.8, `windows` in species/1.9, `record_dates` and
            // `latest_month` in species/1.10, and `fruiting`, `adult` and
            // `larva` in species/1.11, so absent from earlier files.
            properties: {
              area,
              level: { enum: ["state", "county", ...PLACE_LEVELS] },
              records: count,
              record_dates: nullable(count),
              latest_month: nullable(month),
              season,
              season_withheld: seasonWithheld,
              conditions,
              windows,
              flowering: stageResult,
              fruiting: stageResult,
              adult: stageResult,
              larva: stageResult,
              // Added in species/1.15 (ODR-2026-042), so absent from earlier
              // files. The last four are given for the state only.
              male: stageResult,
              female: stageResult,
              signs: {
                type: "object",
                propertyNames: { enum: [...SIGNS] },
                additionalProperties: signResult,
              },
              heard: heardResult,
              hours: nullable(hours24),
              months_not_reported: nullable(
                list(
                  { type: "integer", minimum: 1, maximum: 12 },
                  { uniqueItems: true },
                ),
              ),
              land_cover: recordLandCover,
              look_alikes: lookAlikes,
            },
          }),
          ranges: list(
            object(
              {
                area,
                level: { enum: ["state", "county"] },
                source: nullable(string),
                seasons: rangeSeasons,
              },
              areaMatchesLevel,
            ),
          ),
        }),
        {
          statuses: list({
            ...object({
              list: { enum: ["usfws", "ohio"] },
              place: pattern(`^(us|${STATE})$`),
              listed_name: text,
              status: text,
              where: nullable(text),
            }),
            // Optional: added in species/1.6, so absent from earlier files.
            properties: {
              list: { enum: ["usfws", "ohio"] },
              place: pattern(`^(us|${STATE})$`),
              listed_name: text,
              status: text,
              where: nullable(text),
              list_name: text,
              keeper: text,
              edition: text,
            },
          }),
          // Ohio's species of concern and special interest (species/1.13,
          // ODR-2026-041): never listings, never making records sensitive.
          concerns: list(
            object({
              list: { const: "ohio" },
              place: pattern(`^${STATE}$`),
              listed_name: text,
              category: { enum: ["species of concern", "special interest"] },
              list_name: text,
              keeper: text,
              edition: text,
            }),
          ),
          // Counties with records counted toward a result but no county
          // result of their own (species/1.14): names only, `[]` where the
          // species is sensitive.
          recorded_in: list(county),
          introductions: list(
            object({
              // The Ohio sources and region from species/1.12 (ODR-2026-039).
              source: {
                enum: [
                  "us-riis-l48-v2",
                  "inaturalist-checklist",
                  "oh-oda-invasive-plants",
                  "oh-odnr-aquatic-invasive",
                ],
              },
              region: { enum: ["us-l48", "us-oh"] },
              listed_name: text,
              status: { enum: ["introduced", "invasive"] },
            }),
          ),
          inaturalist_taxon_id: nullable({ type: "integer", minimum: 1 }),
          photo,
          // A photo per stage, sex or kind of sign (species/1.15); `{}` for a
          // species sensitive anywhere it is shown.
          part_photos: {
            type: "object",
            propertyNames: {
              enum: [
                "flowering",
                "fruiting",
                "adult",
                "larva",
                "male",
                "female",
                ...SIGNS,
              ],
            },
            additionalProperties: (photo.anyOf as Schema[])[0],
          },
          below_species: belowSpecies,
        },
      ),
    ),
    sinceMinorData("species", 1, ["statuses"]),
    sinceMinorData("species", 2, ["introductions"]),
    sinceMinorData("species", 3, ["inaturalist_taxon_id"]),
    sinceMinorData("species", 4, ["photo"]),
    sinceMinorData("species", 5, ["below_species"]),
    sinceMinorData("species", 13, ["concerns"]),
    sinceMinorData("species", 14, ["recorded_in"]),
    sinceMinorData("species", 15, ["part_photos"]),
  ),

  slugs: file(
    "slugs",
    "Species page slugs, and redirects from old slugs.",
    object({
      species: {
        type: "object",
        propertyNames: slug,
        additionalProperties: speciesKey,
      },
      redirects: {
        type: "object",
        propertyNames: slug,
        additionalProperties: slug,
      },
    }),
  ),

  groups: file(
    "groups",
    "The browse groups, in display order.",
    object({
      groups: list(
        object({ group, name: text, taxa: list(text), species: count }),
      ),
    }),
  ),

  search: file(
    "search",
    "Every searchable name, as [name, kind, species key]. May be split into shards.",
    object({
      names: list(
        tuple(
          text,
          { enum: ["scientific", "common", "other-name", "synonym"] },
          speciesKey,
        ),
      ),
    }),
  ),

  region: withRules(
    file(
      "region",
      "A state, its counties, their species and effort.",
      object({
        state,
        name: text,
        slug,
        areas: list({
          ...object(
            {
              area,
              level: { enum: ["state", "county"] },
              name: text,
              slug,
              species_keys: list(speciesKey),
              range_species_keys: list(speciesKey),
              effort: weekly,
            },
            areaMatchesLevel,
          ),
          // Optional: `ecoregions` added in region/1.1, `daylight` in
          // region/1.2, `temperature` in region/1.3, `precipitation`,
          // `land_cover` and `elevation` in region/1.4, `warmth` and `frost`
          // in region/1.5, `green_up` in region/1.6 and `full_name` in
          // region/1.7, and `watersheds` and `parks` in region/1.8, so absent
          // from earlier files.`warmth.past_typical_year` added in
          // region/1.10.
          properties: {
            area,
            level: { enum: ["state", "county"] },
            name: text,
            full_name: text,
            slug,
            species_keys: list(speciesKey),
            range_species_keys: list(speciesKey),
            effort: weekly,
            ecoregions: list(
              object({
                ecoregion: { type: "integer", minimum: 1 },
                name: text,
                biome: text,
                share: { type: "number", minimum: 0.05, maximum: 1 },
              }),
            ),
            daylight: list(
              nullable(
                tuple(clock, clock, {
                  type: "number",
                  minimum: 0,
                  maximum: 24,
                }),
              ),
              { minItems: 53, maxItems: 53 },
            ),
            temperature: list(nullable(tuple(celsius, celsius)), {
              minItems: 53,
              maxItems: 53,
            }),
            precipitation: list(nullable({ type: "number", minimum: 0 }), {
              minItems: 53,
              maxItems: 53,
            }),
            land_cover: nullable(
              object({
                year: { type: "integer", minimum: 1985 },
                groups: list(
                  object({
                    group: {
                      enum: [
                        "forest",
                        "farmland",
                        "developed",
                        "wetland",
                        "grassland-shrub",
                        "barren",
                      ],
                    },
                    share: percent,
                  }),
                ),
                classes: list(
                  object({
                    class: { type: "integer", minimum: 11, maximum: 95 },
                    share: percent,
                  }),
                ),
                water: percent,
              }),
            ),
            elevation: nullable(
              object({
                min: { type: "integer" },
                median: { type: "integer" },
                max: { type: "integer" },
              }),
            ),
            warmth: nullable({
              ...object({
                through: date,
                degree_days: { type: "integer", minimum: 0 },
                normal: { type: "integer", minimum: 0 },
                days_ahead: nullable({ type: "integer" }),
                provisional: { type: "boolean" },
              }),
              // Optional: `past_typical_year` added in region/1.10, so absent
              // from earlier files.
              properties: {
                through: date,
                degree_days: { type: "integer", minimum: 0 },
                normal: { type: "integer", minimum: 0 },
                days_ahead: nullable({ type: "integer" }),
                past_typical_year: { type: "boolean" },
                provisional: { type: "boolean" },
              },
            }),
            frost: nullable(
              object({
                last_spring: nullable(monthDay),
                first_fall: nullable(monthDay),
              }),
            ),
            green_up: nullable(
              object({
                typical: monthDay,
                years: {
                  type: "array",
                  items: { type: "integer", minimum: 2000 },
                  minItems: 2,
                  maxItems: 2,
                },
                latest_year: { type: "integer", minimum: 2000 },
                latest: monthDay,
                days_later: { type: "integer" },
              }),
            ),
            watersheds: list(watershed),
            parks: list({ anyOf: [park, parkSystem] }),
          },
        }),
      }),
    ),
    sinceMinor("region", 8, { areas: ["watersheds", "parks"] }),
  ),

  "state-weekly": file(
    "state-weekly",
    "A species' weekly result for a state.",
    weeklyResult(state),
  ),

  "county-weekly": file(
    "county-weekly",
    "A species' weekly result for a county.",
    weeklyResult(county),
  ),

  attribution: file(
    "attribution",
    "The sources behind a result.",
    object({
      area,
      species_key: speciesKey,
      datasets: list(
        object({
          dataset_key: text,
          title: nullable(string),
          publisher: nullable(string),
          citation: nullable(string),
          url: nullable(string),
          records: count,
        }),
      ),
      gbif_download_dois: list(text),
      // One entry per kind of link: the address with `{id}` in place of the
      // number, and the numbers ascending, each but the first as the
      // difference from the one before (formats.md 1.38).
      records: nullable(
        list(
          object({
            link: pattern("^https://[^\\s]*\\{id\\}[^\\s]*$"),
            ids: list(count, { minItems: 1 }),
          }),
        ),
      ),
    }),
  ),

  backyard: withRules(
    file(
      "backyard",
      "A county's Backyard label for each species and week.",
      object({
        area: county,
        method: text,
        evidence_through: nullable(date),
        effort: weekly,
        species: list(
          withOptional(
            object({
              species_key: speciesKey,
              group: nullable(group),
              labels: pattern("^[csrmn]{53}$"),
              range: nullable(
                object({ source: nullable(string), seasons: rangeSeasons }),
              ),
            }),
            {
              records: nullable(count),
              weekly: nullable(weekly),
              season,
              season_withheld: seasonWithheld,
              windows,
              conditions: nullable(conditions),
              stages: stageSeasons,
            },
          ),
        ),
      }),
    ),
    sinceMinor("backyard", 1, {
      species: ["records", "weekly", "season", "season_withheld"],
    }),
    sinceMinor("backyard", 2, { species: ["stages"] }),
    sinceMinor("backyard", 3, { species: ["windows", "conditions"] }),
  ),

  methods: file(
    "methods",
    "How results are made: the method and its numbers.",
    object({
      method: text,
      data_rules: text,
      thresholds: { type: "object" },
      weeks: text,
      pooled_from: text,
      taxonomy: text,
      boundaries: text,
      protection: { type: "object", additionalProperties: string },
      ranges: list(text),
      limits: text,
    }),
  ),

  sources: file(
    "sources",
    "Each source, its licence and how to credit it.",
    object({
      sources: list(
        object({
          source: text,
          name: text,
          kind: text,
          licence: text,
          licence_url: nullable(text),
          use: text,
          reviewed: date,
          credit: text,
          url: text,
        }),
      ),
    }),
  ),

  boundaries: file(
    "boundaries",
    "County outlines for a state's map, as a GeoJSON FeatureCollection. For display only.",
    object({
      type: { const: "FeatureCollection" },
      features: list(
        object({
          type: { const: "Feature" },
          properties: object({ area: county, name: text, slug }),
          geometry: object({
            type: { const: "MultiPolygon" },
            coordinates: list(
              list(
                list(
                  tuple(
                    { type: "number", minimum: -180, maximum: 180 },
                    { type: "number", minimum: -90, maximum: 90 },
                  ),
                  { minItems: 4 },
                ),
                { minItems: 1 },
              ),
              { minItems: 1 },
            ),
          }),
        }),
      ),
    }),
  ),

  cities: file(
    "cities",
    "A state's cities, villages and census-designated places, and the counties each falls in (ODR-2026-040).",
    object({
      cities: list(
        object({
          name: text,
          type: { enum: ["city", "village", "cdp"] },
          area: county,
          also_in: list(county),
        }),
      ),
    }),
  ),

  places: withRules(
    file(
      "places",
      "Every watershed, every ecoregion, or every national and state park and metro park system with results, with its species with a result (ODR-2026-043, ODR-2026-044). No place file holds a sensitive species. May be split into shards.",
      object({
        kind: { enum: ["watersheds", "ecoregions", "parks"] },
        places: list(
          withOptional(
            object(
              {
                area: place,
                level: { enum: [...PLACE_LEVELS] },
                name: text,
                slug,
                code: {
                  anyOf: [
                    pattern("^\\d{8}$"),
                    { type: "integer", minimum: 1 },
                    { type: "null" },
                  ],
                },
                states: list(state),
                continues_into: list(state),
                counties: list(county),
                species_keys: list(speciesKey),
                effort: weekly,
                // formats.md 1.32.
                best_weeks: nullable(
                  object({
                    all: tuple(week, week),
                    groups: {
                      type: "object",
                      propertyNames: group,
                      additionalProperties: tuple(week, week),
                    },
                  }),
                ),
                park: nullable(
                  object({
                    type: { enum: ["national", "state", "park-system"] },
                    agency: text,
                    acres: nullable({ type: "number", minimum: 0 }),
                    official_url: nullable(text),
                    has_page: { type: "boolean" },
                    parks: list(text),
                  }),
                ),
              },
              areaMatchesLevel,
              placeMatchesLevel,
              pageMatchesSpecies(true, { type: "array", minItems: 5 }),
              pageMatchesSpecies(false, { type: "array", maxItems: 0 }),
            ),
            // Added in places/1.1 (ODR-2026-067), so absent from 1.0 files.
            { continues_into_countries: list(country) },
          ),
        ),
      }),
    ),
    { type: "object", properties: { data: placesMatchKind } },
    sinceMinor("places", 1, { places: ["continues_into_countries"] }),
  ),

  "place-boundaries": file(
    "place-boundaries",
    "Watershed and ecoregion outlines, and park middles as points, for maps, as a GeoJSON FeatureCollection. For display only.",
    object({
      type: { const: "FeatureCollection" },
      features: list(
        object(
          {
            type: { const: "Feature" },
            properties: object({
              area: place,
              name: text,
              slug,
              system: nullable(parkSystem),
            }),
            geometry: {
              anyOf: [
                multiPolygon,
                object({ type: { const: "Point" }, coordinates: position }),
              ],
            },
          },
          geometryMatchesArea,
        ),
      ),
    }),
  ),

  "place-weekly": file(
    "place-weekly",
    "A species' weekly result for a watershed, ecoregion, park or metro park system.",
    weeklyResult(place),
  ),

  "place-labels": file(
    "place-labels",
    "A place's label for each species with a result there and each week. May be split into shards.",
    object({
      area: place,
      method: text,
      evidence_through: nullable(date),
      effort: weekly,
      species: list(
        object(
          {
            species_key: speciesKey,
            group: nullable(group),
            labels: pattern("^[csr]{53}$"),
            records: count,
            weekly,
            season,
            season_withheld: seasonWithheld,
          },
          seasonMatchesWithheld,
        ),
      ),
    }),
  ),

  postal: file(
    "postal",
    "US ZIP codes sharing a 3-digit prefix, and the counties each falls in.",
    object({
      zips: {
        type: "object",
        propertyNames: pattern("^\\d{5}$"),
        additionalProperties: list(
          tuple(county, { type: "number", minimum: 0, maximum: 1 }),
          { minItems: 1 },
        ),
      },
    }),
  ),
} satisfies Record<Kind, Schema>;
