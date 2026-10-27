// A made-up release for search (ODR-2026-070). Species, places, names,
// seasons and counts are invented; the county codes are only codes, and say
// nothing about the real counties.
import { wrap } from "./fixture.ts";

const weeks = (value: number): number[] =>
  Array.from({ length: 53 }, () => value);

const STATE = "us-oh";

interface Made {
  readonly key: string;
  readonly scientific: string;
  readonly common: string | null;
  readonly group: string | null;
  readonly season: number[];
  readonly slug?: string | null;
  readonly sensitive?: string[] | undefined;
}

// The site's own search test's index (apps test/search.test.ts), and a few more.
const SPECIES: readonly Made[] = [
  {
    key: "AAAAA",
    scientific: "Nymphalis antiopa",
    common: "Mourning Cloak",
    group: "butterflies",
    season: [10, 14, 20],
  },
  {
    key: "BBBBB",
    scientific: "Quercus rubra",
    common: "Northern red oak",
    group: "plants",
    season: [16, 20, 26],
  },
  {
    key: "CCCCC",
    scientific: "Hydrangea quercifolia",
    common: "Oak-leaf hydrangea",
    group: "plants",
    season: [22, 26, 30],
  },
  {
    key: "DDDDD",
    scientific: "Quercus alba",
    common: "White oak",
    group: "plants",
    season: [],
  },
  {
    key: "EEEEE",
    scientific: "Turdus migratorius",
    common: "American robin",
    group: "birds",
    // Kept together over the year end.
    season: [48, 2, 8],
  },
  {
    key: "FFFFF",
    scientific: "Erigeron pulchellus",
    common: "Robin's plantain",
    group: "plants",
    season: [14, 17, 22],
  },
  {
    key: "GGGGG",
    scientific: "Ranunculus sceleratus",
    common: null,
    group: "plants",
    season: [18, 22, 28],
  },
  // No page, so never in a place's list; still found by name.
  {
    key: "HHHHH",
    scientific: "Exemplum nullum",
    common: "Pageless warbler",
    group: "birds",
    season: [15, 18, 21],
    slug: null,
  },
  // Sensitive in the state: never in a park's list.
  {
    key: "IIIII",
    scientific: "Exemplum occultum",
    common: "Hidden lady's-slipper",
    group: "plants",
    season: [20, 23, 26],
    sensitive: [STATE],
  },
  // The catalogue does not say whether it is sensitive: never in a park's list.
  {
    key: "JJJJJ",
    scientific: "Exemplum incertum",
    common: "Unsure sparrow",
    group: null,
    season: [12, 13, 14],
    sensitive: undefined,
  },
];

const entry = (s: Made) => ({
  species_key: s.key,
  scientific_name: s.scientific,
  common_name: s.common,
  rank: "species",
  kingdom: null,
  phylum: null,
  class: null,
  order: null,
  family: null,
  genus: null,
  group: s.group,
  slug:
    s.slug === undefined
      ? s.scientific.toLowerCase().replace(" ", "-")
      : s.slug,
  states: [STATE],
  seasons: { [STATE]: s.season },
  ...("sensitive" in s
    ? s.sensitive === undefined
      ? {}
      : { sensitive_in: s.sensitive }
    : { sensitive_in: [] }),
});

const names = [
  ...SPECIES.flatMap((s) => [
    ...(s.common === null ? [] : [[s.common, "common", s.key]]),
    [s.scientific, "scientific", s.key],
  ]),
  ["Ranunculus scelerata", "synonym", "GGGGG"],
  ["Pink fleabane", "other-name", "FFFFF"],
  // A name whose species is not in the catalogue.
  ["Phantom oak moth", "common", "ZZZZZ"],
];

const area = (
  code: string,
  level: "state" | "county",
  name: string,
  keys: string[],
  fullName?: string,
) => ({
  area: code,
  level,
  name,
  ...(fullName === undefined ? {} : { full_name: fullName }),
  slug: name.toLowerCase().replace(/ /g, "-"),
  species_keys: keys,
  range_species_keys: [],
  effort: weeks(10),
});

/** One species' row in a county's Nearby file, with a county result or without. */
const nearbyRow = (
  key: string,
  records: number | null,
  season: number[] = [],
) => ({
  species_key: key,
  group: SPECIES.find((s) => s.key === key)?.group ?? null,
  labels: "r".repeat(53),
  range: null,
  records,
  weekly: records === null ? null : weeks(1),
  season,
  season_withheld: null,
  windows: null,
  conditions: null,
  stages: {},
});

const labelRow = (key: string, records: number, season: number[]) => ({
  species_key: key,
  group: SPECIES.find((s) => s.key === key)?.group ?? null,
  labels: "s".repeat(53),
  records,
  weekly: weeks(1),
  season,
  season_withheld: null,
});

const place = (
  code: string,
  level: string,
  name: string,
  keys: string[],
  park: { type: string; has_page: boolean } | null = null,
  hucOrEco: string | number | null = null,
) => ({
  area: code,
  level,
  name,
  slug: name.toLowerCase().replace(/ /g, "-"),
  code: hucOrEco,
  states: [STATE],
  continues_into: [],
  counties: ["39001"],
  species_keys: keys,
  effort: weeks(5),
  best_weeks: null,
  park:
    park === null
      ? null
      : {
          ...park,
          agency: "Made-up agency",
          acres: null,
          official_url: null,
          parks: [],
        },
});

const OAK_HOLLOW = "park-oak-hollow-state-park";

const files: [string, string, unknown][] = [
  ["catalogue.json", "catalogue", { species: SPECIES.map(entry) }],
  ["search/index.json", "search", { names }],
  [
    "groups.json",
    "groups",
    {
      groups: [
        { group: "birds", name: "Birds", taxa: [], species: 3 },
        { group: "plants", name: "Flowering plants", taxa: [], species: 6 },
        {
          group: "butterflies",
          name: "Butterflies and moths",
          taxa: [],
          species: 1,
        },
      ],
    },
  ],
  [
    `regions/${STATE}.json`,
    "region",
    {
      state: STATE,
      areas: [
        area(STATE, "state", "Ohio", ["AAAAA", "BBBBB"]),
        area("39001", "county", "Oakwood", ["AAAAA", "BBBBB", "CCCCC"]),
        area("39003", "county", "Robinson", [], "Robinson Parish"),
        area("39005", "county", "Ashby", ["EEEEE"]),
      ],
    },
  ],
  [
    `nearby/${STATE}/39001.json`,
    "nearby",
    {
      area: "39001",
      method: "test-1",
      evidence_through: "2025-12-31",
      effort: weeks(10),
      species: [
        nearbyRow("AAAAA", 40, [10, 13, 20]),
        nearbyRow("BBBBB", 90, [17, 20, 25]),
        nearbyRow("CCCCC", 90, [22, 25, 31]),
        // A mapped range only: no county result, so not listed.
        nearbyRow("EEEEE", null),
        // A county result whose season is withheld.
        nearbyRow("FFFFF", 3),
        // No page.
        nearbyRow("HHHHH", 12, [15, 18, 21]),
      ],
    },
  ],
  [
    "places/parks.json",
    "places",
    {
      kind: "parks",
      places: [
        place(OAK_HOLLOW, "park", "Oak Hollow State Park", ["BBBBB", "IIIII"], {
          type: "state",
          has_page: true,
        }),
        place(
          "parks-robin-metro-parks",
          "park-system",
          "Robin Metro Parks",
          ["EEEEE"],
          { type: "park-system", has_page: true },
        ),
        place("park-oak-knoll-park", "park", "Oak Knoll Park", [], {
          type: "national",
          has_page: false,
        }),
      ],
    },
  ],
  [
    `labels/${OAK_HOLLOW}.json`,
    "place-labels",
    {
      area: OAK_HOLLOW,
      method: "test-1",
      evidence_through: "2025-12-31",
      effort: weeks(5),
      species: [
        labelRow("BBBBB", 30, [16, 19, 24]),
        labelRow("IIIII", 30, [20, 23, 26]),
        labelRow("JJJJJ", 30, [12, 13, 14]),
        labelRow("EEEEE", 8, [47, 1, 9]),
      ],
    },
  ],
  [
    "places/watersheds.json",
    "places",
    {
      kind: "watersheds",
      places: [
        place(
          "huc8-00000001",
          "watershed",
          "Oak Creek",
          ["BBBBB"],
          null,
          "00000001",
        ),
      ],
    },
  ],
  [
    "places/ecoregions.json",
    "places",
    {
      kind: "ecoregions",
      places: [
        place("eco-1", "ecoregion", "Oak Plains", ["BBBBB", "CCCCC"], null, 1),
      ],
    },
  ],
  [
    `places/${STATE}/cities.json`,
    "cities",
    {
      cities: [
        { name: "Oakwood", type: "city", area: "39001", also_in: ["39003"] },
        { name: "Little Oak", type: "village", area: "39005", also_in: [] },
        { name: "Oak Hill", type: "village", area: "39005", also_in: [] },
        { name: "Oak", type: "cdp", area: "39003", also_in: [] },
        // In a county the region file does not list.
        { name: "Oakfield", type: "cdp", area: "39999", also_in: [] },
      ],
    },
  ],
];

/** The made-up release's files, by path inside the release. */
export const searchFiles: Record<string, unknown> = Object.fromEntries(
  files.map(([path, kind, data]) => [path, wrap(path, kind, data)]),
);
