// A made-up release served by a fake fetch. Species, places and counts are invented.
export const provenance = {
  release: "2026-01-05",
  sources: ["example"],
  licences: ["CC-BY-4.0"],
  gbif_download_dois: ["10.0000/example"],
  method: "test-1",
  taxonomy: "test-taxonomy",
  boundaries: "test-boundaries",
  ranges: null,
  protection: null,
  code: "0.0.0",
  run: "run-1",
};

const weeks = (value: number): number[] =>
  Array.from({ length: 53 }, () => value);

export const RELEASE = "2026-01-05";

/** Formats the made-up release publishes at a later minor version than 1.0. */
const MINOR: Readonly<Record<string, number>> = {
  catalogue: 3,
  species: 11,
  search: 1,
  backyard: 1,
};

/** Wraps data as the release file at `path`. */
export const wrap = (path: string, kind: string, data: unknown) => ({
  id: `releases/${RELEASE}/${path}`,
  kind,
  format: `${kind}/1.${String(MINOR[kind] ?? 0)}`,
  provenance,
  data,
});

const classification = {
  kingdom: "Animalia",
  phylum: null,
  class: null,
  order: null,
  family: null,
  genus: "Exemplum",
};

/** A made-up photo: its ID, credit and page are invented. */
const photo = {
  id: "inat-900001",
  source: "default",
  sizes: { species: [480, 768], card: [320, 480, 640], thumb: [64, 96, 128] },
  credit: "(c) Example Photographer, some rights reserved (CC BY-NC)",
  licence: "CC-BY-NC-4.0",
  licence_url: "https://creativecommons.org/licenses/by-nc/4.0/",
  url: "https://www.inaturalist.org/photos/900001",
};

const entry = (key: string, name: string, season: number[] = []) => ({
  species_key: key,
  scientific_name: name,
  common_name: null,
  rank: "species",
  ...classification,
  group: "birds",
  slug: name.toLowerCase().replace(" ", "-"),
  states: ["us-zz"],
  seasons: { "us-zz": season },
  photo: key === "EX1" ? photo : null,
  // Made up: no real listing is implied.
  sensitive_in: [],
  listed_in: key === "EX2" ? ["us-zz"] : [],
  introduced_in: [],
});

/** Made-up records each week, rising from week 12 to a peak and falling by week 37. */
const curve = Array.from({ length: 53 }, (_, i) =>
  i + 1 >= 12 && i + 1 <= 37
    ? Math.round(10 * Math.sin((Math.PI * (i + 1 - 11)) / 27))
    : 0,
);

const result = (area: string) => ({
  area,
  species_key: "EX1",
  included_records: curve.reduce((sum, n) => sum + n, 0),
  contributing_years: 4,
  thresholds: { records: 20, years: 5 },
  weekly: { records: curve, years: curve.map((n) => Math.min(n, 4)) },
  season: [14, 22, 35],
  season_withheld: null,
  effort: weeks(40),
  limits:
    "These results show when people recorded a species, not when or where it occurs.",
});

/** A made-up metro park system with a page: 5 made-up species with a result there. */
const SYSTEM = "parks-example-metro-parks";
const systemSpecies = [
  "EX1",
  ...Array.from({ length: 4 }, (_, i) => `EXP${String(i + 1)}`),
];

const files: [string, string, unknown][] = [
  [
    "notes.json",
    "notes",
    {
      release: RELEASE,
      previous: null,
      results: { added: 2, changed: 0, removed: 0 },
      key_changes: [],
      corrections: [],
      formats: [],
    },
  ],
  [
    "catalogue/0.json",
    "catalogue",
    {
      species: [entry("EX1", "Exemplum primum", [14, 22, 35])],
    },
  ],
  [
    "catalogue/1.json",
    "catalogue",
    {
      species: [entry("EX2", "Exemplum alterum")],
    },
  ],
  [
    "species/EX1.json",
    "species",
    {
      species_key: "EX1",
      scientific_name: "Exemplum primum",
      authorship: null,
      common_name: null,
      synonyms: [],
      rank: "species",
      classification,
      group: "birds",
      slug: "exemplum-primum",
      areas: [
        {
          area: "us-zz",
          level: "state",
          records: 120,
          season: [14, 22, 35],
          season_withheld: null,
          conditions: {
            sunrise: "06:24",
            sunset: "20:51",
            high: 25.6,
            low: 14.4,
            midpoint: 20,
          },
          flowering: null,
          fruiting: null,
          adult: null,
          larva: null,
        },
      ],
      ranges: [],
      statuses: [
        {
          list: "usfws",
          place: "us",
          listed_name: "Exemplum primum",
          status: "Threatened",
          where: "Wherever found",
        },
      ],
      introductions: [
        {
          source: "us-riis-l48-v2",
          region: "us-l48",
          listed_name: "Exemplum primum",
          status: "invasive",
        },
      ],
      inaturalist_taxon_id: 900001,
      photo,
      below_species: [
        {
          area: "us-zz",
          taxa: [
            {
              taxon_key: "EX1A",
              scientific_name: "Exemplum primum subsp. alpha",
              rank: "subspecies",
              common_name: null,
            },
          ],
          other_below_species: true,
        },
      ],
    },
  ],
  [
    "slugs.json",
    "slugs",
    {
      species: { "exemplum-primum": "EX1" },
      redirects: { "old-name": "exemplum-primum" },
    },
  ],
  [
    "groups.json",
    "groups",
    {
      groups: [{ group: "birds", name: "Birds", taxa: ["V2"], species: 2 }],
    },
  ],
  [
    "search/index.json",
    "search",
    {
      names: [
        ["Exemplum primum", "scientific", "EX1"],
        ["Example bird", "common", "EX1"],
        ["Sample songbird", "other-name", "EX1"],
      ],
    },
  ],
  [
    "regions/us-zz.json",
    "region",
    {
      state: "us-zz",
      name: "Zed",
      slug: "zed",
      areas: [
        {
          area: "99001",
          level: "county",
          name: "Example",
          slug: "example",
          species_keys: ["EX1"],
          range_species_keys: [],
          effort: weeks(40),
        },
      ],
    },
  ],
  [
    "attribution/us-zz/EX1.json",
    "attribution",
    {
      area: "us-zz",
      species_key: "EX1",
      datasets: [
        {
          dataset_key: "d1",
          title: "Example dataset",
          publisher: null,
          citation: null,
          url: null,
          records: 120,
        },
      ],
      gbif_download_dois: ["10.0000/example"],
      record_links: null,
    },
  ],
  [
    "backyard/us-zz/99001.json",
    "backyard",
    {
      area: "99001",
      method: "test-1",
      evidence_through: "2025-12-31",
      effort: weeks(40),
      species: [
        {
          species_key: "EX1",
          group: "birds",
          labels: "n".repeat(53),
          range: null,
          records: 40,
          weekly: weeks(1),
          season: [14, 22, 35],
          season_withheld: null,
        },
      ],
    },
  ],
  [
    "methods.json",
    "methods",
    {
      method: "test-1",
      data_rules: "1.0",
      thresholds: { records: 20, years: 5 },
      weeks: "Week 1 is 1–7 January.",
      pooled_from: "2015-01-01",
      taxonomy: "test-taxonomy",
      boundaries: "test-boundaries",
      protection: {},
      ranges: [],
      limits: "Made up.",
    },
  ],
  [
    "sources.json",
    "sources",
    {
      sources: [
        {
          source: "example",
          name: "Example source",
          kind: "records",
          licence: "CC-BY-4.0",
          licence_url: null,
          use: "Made up.",
          reviewed: "2026-01-01",
          credit: "Example",
          url: "https://example.test/",
        },
      ],
    },
  ],
  [
    "places/us-zz/boundaries.json",
    "boundaries",
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { area: "99001", name: "Example", slug: "example" },
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [
                [
                  [0, 0],
                  [1, 0],
                  [0, 1],
                  [0, 0],
                ],
              ],
            ],
          },
        },
      ],
    },
  ],
  [
    "places/us-zz/cities.json",
    "cities",
    {
      // Made-up places.
      cities: [
        { name: "Exampleton", type: "city", area: "99001", also_in: ["99002"] },
        { name: "Sample", type: "village", area: "99002", also_in: [] },
      ],
    },
  ],
  [
    "places/parks.json",
    "places",
    {
      kind: "parks",
      // Made-up parks. Only the system has results, so only it has best weeks.
      places: [
        {
          area: "park-example-state-park",
          level: "park",
          name: "Example State Park",
          slug: "example-state-park",
          code: null,
          states: ["us-zz"],
          continues_into: [],
          counties: ["99001"],
          species_keys: [],
          effort: weeks(2),
          best_weeks: null,
          park: {
            type: "state",
            agency: "Example Department of Parks",
            acres: 270,
            official_url: null,
            has_page: false,
            parks: [],
          },
        },
        {
          area: SYSTEM,
          level: "park-system",
          name: "Example Metro Parks",
          slug: "example-metro-parks",
          code: null,
          states: ["us-zz"],
          continues_into: [],
          counties: ["99001", "99002"],
          species_keys: systemSpecies,
          effort: weeks(20),
          best_weeks: { all: [16, 22], groups: { birds: [17, 20] } },
          park: {
            type: "park-system",
            agency: "Example Metro Parks",
            acres: null,
            official_url: "https://parks.example.test/",
            has_page: true,
            parks: ["Example Reservation", "Sample Woods"],
          },
        },
      ],
    },
  ],
  [
    "places/watersheds.json",
    "places",
    {
      kind: "watersheds",
      // A made-up watershed that runs into a state not covered.
      places: [
        {
          area: "huc8-99990001",
          level: "watershed",
          name: "Example River",
          slug: "example-river-99990001",
          code: "99990001",
          states: ["us-zz"],
          continues_into: ["us-yy"],
          counties: ["99001", "99002"],
          species_keys: ["EX1"],
          effort: weeks(30),
          best_weeks: null,
          park: null,
        },
      ],
    },
  ],
  [
    "places/watersheds/boundaries.json",
    "place-boundaries",
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            area: "huc8-99990001",
            name: "Example River",
            slug: "example-river-99990001",
            system: null,
          },
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [
                [
                  [0, 0],
                  [2, 0],
                  [0, 2],
                  [0, 0],
                ],
              ],
            ],
          },
        },
      ],
    },
  ],
  [
    "places/parks/boundaries.json",
    "place-boundaries",
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            area: "park-example-state-park",
            name: "Example State Park",
            slug: "example-state-park",
            system: null,
          },
          geometry: { type: "Point", coordinates: [0.5, 0.25] },
        },
        {
          type: "Feature",
          properties: {
            area: "park-example-reservation",
            name: "Example Reservation",
            slug: "example-reservation",
            system: SYSTEM,
          },
          geometry: { type: "Point", coordinates: [0.25, 0.5] },
        },
      ],
    },
  ],
  [
    `labels/${SYSTEM}.json`,
    "place-labels",
    {
      area: SYSTEM,
      method: "test-1",
      evidence_through: "2025-12-31",
      effort: weeks(20),
      species: [
        {
          species_key: "EX1",
          group: "birds",
          labels: "r".repeat(13) + "s".repeat(10) + "r".repeat(30),
          records: 30,
          weekly: weeks(1),
          season: [14, 22, 35],
          season_withheld: null,
        },
      ],
    },
  ],
  [
    `attribution/places/${SYSTEM}/EX1.json`,
    "attribution",
    {
      area: SYSTEM,
      species_key: "EX1",
      datasets: [
        {
          dataset_key: "d1",
          title: "Example dataset",
          publisher: null,
          citation: null,
          url: null,
          records: 30,
        },
      ],
      gbif_download_dois: ["10.0000/example"],
      record_links: ["https://example.test/records/1"],
    },
  ],
  [
    "postal/us/999.json",
    "postal",
    {
      zips: {
        "99901": [
          ["99001", 0.75],
          ["99002", 0.25],
        ],
      },
    },
  ],
];

export const releaseFiles: Record<string, unknown> =
  Object.fromEntries<unknown>([
    ...files.map(([path, kind, data]): [string, unknown] => [
      path,
      wrap(path, kind, data),
    ]),
    ...(
      [
        ["results/us-zz/EX1.json", "state-weekly", "us-zz"],
        ["results/us-zz/99001/EX1.json", "county-weekly", "99001"],
        [`results/places/${SYSTEM}/EX1.json`, "place-weekly", SYSTEM],
      ] as const
    ).map(([path, kind, area]): [string, unknown] => [
      path,
      wrap(path, kind, result(area)),
    ]),
  ]);

const encoder = new TextEncoder();

async function sha256(text: string): Promise<string> {
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(text)),
  );
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface FakeServer {
  readonly fetch: typeof fetch;
  readonly requests: string[];
  /** Every file served, by path from the API root. */
  readonly files: ReadonlyMap<string, string>;
  /** Replace a file's body as served, without changing the manifest. */
  readonly tamper: (path: string, body: string) => void;
  /** Answer the next requests for a path with these statuses first. */
  readonly failNext: (path: string, ...statuses: number[]) => void;
}

/** Serves the made-up release at https://example.test/. */
export async function fakeServer(): Promise<FakeServer> {
  const bodies = new Map<string, string>();
  const entries = [];
  for (const [path, file] of Object.entries(releaseFiles)) {
    const body = JSON.stringify(file);
    bodies.set(`releases/${RELEASE}/${path}`, body);
    entries.push({
      path,
      sha256: await sha256(body),
      format: (file as { format: string }).format,
      bytes: body.length,
    });
  }
  // The release archive is listed, not served: it is not JSON, so its
  // manifest entry has no format.
  const archive = "made-up archive";
  entries.push({
    path: "archive.tar.gz",
    sha256: await sha256(archive),
    format: null,
    bytes: archive.length,
  });
  bodies.set(
    `releases/${RELEASE}/manifest.json`,
    JSON.stringify({
      id: `releases/${RELEASE}/manifest.json`,
      kind: "manifest",
      format: "manifest/2.1",
      provenance,
      data: {
        release: RELEASE,
        published_at: `${RELEASE}T06:00:00Z`,
        parts: 1,
        files: entries,
        counts: {
          species: 2,
          state_results: 1,
          county_results: 1,
          place_results: 1,
          records: 120,
        },
      },
    }),
  );
  bodies.set(
    "current.json",
    JSON.stringify({
      id: "current.json",
      kind: "current",
      format: "current/1.0",
      provenance,
      data: { release: RELEASE, published_at: `${RELEASE}T06:00:00Z` },
    }),
  );
  bodies.set(
    "releases.json",
    JSON.stringify({
      id: "releases.json",
      kind: "releases",
      format: "releases/1.0",
      provenance,
      data: {
        releases: [
          {
            release: RELEASE,
            status: "current",
            published_at: `${RELEASE}T06:00:00Z`,
            doi: null,
            builds_on: null,
            reason: null,
          },
        ],
      },
    }),
  );
  bodies.set(
    "terms.json",
    JSON.stringify({
      id: "terms.json",
      kind: "terms",
      format: "terms/1.1",
      provenance,
      data: {
        licence: "CC-BY-NC-4.0",
        licence_url: "https://creativecommons.org/licenses/by-nc/4.0/",
        scope: "Made up.",
        cite: "Made up.",
        credit: "Made up.",
        warranty: "Made up.",
        contact: "nobody@example.test",
      },
    }),
  );

  const requests: string[] = [];
  const failures = new Map<string, number[]>();
  const fakeFetch = (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    const path = url.pathname.slice(1);
    requests.push(path);
    const status = failures.get(path)?.shift();
    if (status !== undefined)
      return Promise.resolve(new Response("", { status }));
    const body = bodies.get(path);
    return Promise.resolve(
      body === undefined
        ? new Response("", { status: 404 })
        : new Response(body),
    );
  };
  return {
    fetch: fakeFetch,
    requests,
    files: bodies,
    tamper: (path, body) => bodies.set(path, body),
    failNext: (path, ...statuses) => failures.set(path, statuses),
  };
}
