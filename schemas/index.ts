// The source of the JSON Schemas in this folder. `pnpm schemas` writes them as
// `<kind>-<major>.json`; `pnpm schemas:check` fails when the files are out of
// date.
import type {
  AttributionFile,
  BackyardFile,
  BoundariesFile,
  CatalogueFile,
  CountyResultFile,
  CurrentFile,
  GroupsFile,
  ManifestFile,
  MethodsFile,
  NotesFile,
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
  | CountyResultFile
  | CurrentFile
  | GroupsFile
  | ManifestFile
  | MethodsFile
  | NotesFile
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
 * `manifest/2.0` (data rules 1.30), which may be split into parts.
 */
export const majorOf = (kind: string): number => (kind === "manifest" ? 2 : 1);

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
/** A temperature in °C, to one decimal. */
const celsius: Schema = { type: "number" };
const time = pattern("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$");
const STATE = "[a-z]{2}-[a-z0-9]{1,3}";
const COUNTY = "\\d{5}";
const KEY = "[A-Za-z0-9._-]+";
const state = pattern(`^${STATE}$`);
const county = pattern(`^${COUNTY}$`);
const area: Schema = { anyOf: [state, county] };
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

/** `area` is a state code when `level` is `state`, and a county's 5-digit Census code when it is `county`. */
const areaMatchesLevel: Schema = {
  anyOf: [
    {
      type: "object",
      properties: { level: { const: "state" }, area: state },
    },
    {
      type: "object",
      properties: { level: { const: "county" }, area: county },
    },
  ],
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
/** A flowering result's season, or its reason, which may be too few records. */
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
const seasonWithheld = nullable({
  enum: ["year-round", "two-seasons", "one-year", "precision"],
});

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
  attribution: `${RELEASE}attribution/${STATE}(/${COUNTY})?/${KEY}`,
  backyard: `${RELEASE}backyard/${STATE}/${COUNTY}`,
  methods: `${RELEASE}methods`,
  sources: `${RELEASE}sources`,
  boundaries: `${RELEASE}places/${STATE}/boundaries`,
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

  manifest: file(
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
      counts: object({
        species: count,
        state_results: count,
        county_results: count,
        records: count,
      }),
    }),
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
              listed_in: list(state),
              introduced_in: list(state),
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
                level: { enum: ["state", "county"] },
                records: count,
                season,
                season_withheld: seasonWithheld,
              },
              areaMatchesLevel,
              seasonMatchesWithheld,
            ),
            // Optional: `conditions` added in species/1.7 and `flowering` in
            // species/1.8, so absent from earlier files.
            properties: {
              area,
              level: { enum: ["state", "county"] },
              records: count,
              season,
              season_withheld: seasonWithheld,
              conditions: object({
                sunrise: nullable(clock),
                sunset: nullable(clock),
                high: nullable(celsius),
                low: nullable(celsius),
                midpoint: nullable(celsius),
              }),
              flowering: nullable(
                object(
                  {
                    records: count,
                    season,
                    season_withheld: nullable({
                      enum: [
                        "too-few-records",
                        "year-round",
                        "two-seasons",
                        "one-year",
                        "precision",
                      ],
                    }),
                  },
                  floweringMatchesWithheld,
                ),
              ),
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
          introductions: list(
            object({
              source: { const: "us-riis-l48-v2" },
              region: { const: "us-l48" },
              listed_name: text,
              status: { enum: ["introduced", "invasive"] },
            }),
          ),
          inaturalist_taxon_id: nullable({ type: "integer", minimum: 1 }),
          photo,
          below_species: belowSpecies,
        },
      ),
    ),
    sinceMinorData("species", 1, ["statuses"]),
    sinceMinorData("species", 2, ["introductions"]),
    sinceMinorData("species", 3, ["inaturalist_taxon_id"]),
    sinceMinorData("species", 4, ["photo"]),
    sinceMinorData("species", 5, ["below_species"]),
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

  region: file(
    "region",
    "A state, its counties, their species and effort.",
    object({
      state,
      name: text,
      slug,
      areas: list(
        object(
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
      ),
    }),
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
      record_links: nullable(list(text)),
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
            },
          ),
        ),
      }),
    ),
    sinceMinor("backyard", 1, {
      species: ["records", "weekly", "season", "season_withheld"],
    }),
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
