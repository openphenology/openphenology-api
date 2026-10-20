import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, test } from "vitest";
import { majorOf, schemas } from "../schemas/index.ts";
import { fakeServer } from "./fixture.ts";

interface Published {
  kind: string;
  data: Record<string, unknown>;
  [field: string]: unknown;
}

const ajv = new Ajv2020({ strict: true, allErrors: true });
const validators = new Map(
  Object.entries(schemas).map(([kind, schema]) => [kind, ajv.compile(schema)]),
);

/** The first item of a list in a fixture, which every case expects to exist. */
function first(list: unknown): Record<string, unknown> {
  if (!Array.isArray(list) || list.length === 0) throw new Error("empty list");
  return list[0] as Record<string, unknown>;
}

async function published(): Promise<Map<string, Published>> {
  const server = await fakeServer();
  return new Map(
    [...server.files].map(([path, body]) => [
      path,
      JSON.parse(body) as Published,
    ]),
  );
}

function errors(file: Published): string[] {
  const validate = validators.get(file.kind);
  if (!validate) return [`no schema for kind ${file.kind}`];
  validate(file);
  return (validate.errors ?? []).map(
    (error) => `${error.instancePath} ${error.message ?? ""}`,
  );
}

describe("schemas", () => {
  test("every made-up file matches its schema", async () => {
    for (const [path, file] of await published()) {
      expect(errors(file), path).toEqual([]);
    }
  });

  test("there is a schema for each kind of file, and a file for each schema", async () => {
    const kinds = new Set([...(await published()).values()].map((f) => f.kind));
    expect([...kinds].sort()).toEqual(Object.keys(schemas).sort());
  });

  test("each schema names its kind and major version", () => {
    for (const [kind, schema] of Object.entries(schemas)) {
      expect(schema.title).toBe(
        `OpenPhenology ${kind}/${String(majorOf(kind))}`,
      );
    }
  });

  test("a shard's id is its own path", async () => {
    const files = await published();
    expect(files.get("releases/2026-01-05/catalogue/1.json")?.id).toBe(
      "releases/2026-01-05/catalogue/1.json",
    );
    const attribution = structuredClone(
      files.get("releases/2026-01-05/attribution/us-zz/EX1.json"),
    );
    if (!attribution) throw new Error("missing fixture");
    attribution.id = "releases/2026-01-05/attribution/us-zz/99001/EX1/2.json";
    expect(errors(attribution)).toEqual([]);
  });

  test("a catalogue/1.0 file needs no seasons", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/catalogue/0.json"),
    );
    if (!file) throw new Error("missing fixture");
    file.format = "catalogue/1.0";
    delete first(file.data.species).seasons;
    expect(errors(file)).toEqual([]);
  });

  test("a species/1.0 file needs no statuses", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/species/EX1.json"),
    );
    if (!file) throw new Error("missing fixture");
    file.format = "species/1.0";
    delete file.data.statuses;
    expect(errors(file)).toEqual([]);
  });

  test("a species/1.6 file needs no conditions, and a 1.7 time is HH:MM", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/species/EX1.json"),
    );
    if (!file) throw new Error("missing fixture");
    const area = first(file.data.areas);
    file.format = "species/1.7";
    area.conditions = {
      sunrise: "06:24",
      sunset: null,
      high: null,
      low: 14.4,
      midpoint: 20,
    };
    expect(errors(file)).toEqual([]);
    area.conditions = {
      sunrise: "6:24",
      sunset: null,
      high: null,
      low: 14.4,
      midpoint: 20,
    };
    expect(errors(file)).not.toEqual([]);
    file.format = "species/1.6";
    delete area.conditions;
    expect(errors(file)).toEqual([]);
  });

  test("species/1.11 fruiting, adult and larva results take the flowering form", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/species/EX1.json"),
    );
    if (!file) throw new Error("missing fixture");
    const area = first(file.data.areas);
    file.format = "species/1.11";
    for (const field of ["fruiting", "adult", "larva"]) {
      area[field] = {
        records: 31,
        season: [20, 24, 29],
        season_withheld: null,
        windows: null,
      };
      expect(errors(file), field).toEqual([]);
      area[field] = {
        records: 7,
        season: [],
        season_withheld: "too-few-records",
        windows: null,
      };
      expect(errors(file), field).toEqual([]);
      area[field] = { records: 7, season: [], season_withheld: null };
      expect(errors(file), field).not.toEqual([]);
      area[field] = null;
      expect(errors(file), field).toEqual([]);
    }
    // Absent from files before species/1.11.
    file.format = "species/1.10";
    delete area.fruiting;
    delete area.adult;
    delete area.larva;
    expect(errors(file)).toEqual([]);
  });

  test("a species/1.8 flowering result has weeks or a reason, and 1.7 files need none", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/species/EX1.json"),
    );
    if (!file) throw new Error("missing fixture");
    const area = first(file.data.areas);
    file.format = "species/1.8";
    area.flowering = {
      records: 64,
      season: [16, 18, 21],
      season_withheld: null,
    };
    expect(errors(file)).toEqual([]);
    area.flowering = {
      records: 7,
      season: [],
      season_withheld: "too-few-records",
    };
    expect(errors(file)).toEqual([]);
    area.flowering = { records: 7, season: [], season_withheld: null };
    expect(errors(file)).not.toEqual([]);
    area.flowering = {
      records: 64,
      season: [16, 18, 21],
      season_withheld: "too-few-records",
    };
    expect(errors(file)).not.toEqual([]);
    area.flowering = null;
    expect(errors(file)).toEqual([]);
    file.format = "species/1.7";
    delete area.flowering;
    expect(errors(file)).toEqual([]);
  });

  test("species/1.9 windows: two for a two-season result, none otherwise", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/species/EX1.json"),
    );
    if (!file) throw new Error("missing fixture");
    const area = first(file.data.areas);
    file.format = "species/1.9";
    area.windows = null;
    expect(errors(file)).toEqual([]);
    const two = [
      { records: 48, season: [14, 17, 21], season_withheld: null },
      { records: 15, season: [], season_withheld: "too-few-records" },
    ];
    // A result with season weeks has no windows.
    area.windows = two;
    expect(errors(file)).not.toEqual([]);
    area.season = [];
    area.season_withheld = "two-seasons";
    expect(errors(file)).toEqual([]);
    area.windows = [two[0]];
    expect(errors(file)).not.toEqual([]);
    area.windows = [two[0], { ...two[1], season_withheld: null }];
    expect(errors(file)).not.toEqual([]);
    area.windows = two;
    area.flowering = {
      records: 30,
      season: [],
      season_withheld: "two-seasons",
      windows: two,
    };
    expect(errors(file)).toEqual([]);
    file.format = "species/1.8";
    delete area.windows;
    delete (area.flowering as Record<string, unknown>).windows;
    expect(errors(file)).toEqual([]);
  });

  test("species/1.10 record dates and latest month, null or valid", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/species/EX1.json"),
    );
    if (!file) throw new Error("missing fixture");
    const area = first(file.data.areas);
    file.format = "species/1.10";
    area.record_dates = 87;
    area.latest_month = "2025-12";
    expect(errors(file)).toEqual([]);
    area.latest_month = "2025-13";
    expect(errors(file)).not.toEqual([]);
    area.latest_month = "2025-06-01";
    expect(errors(file)).not.toEqual([]);
    area.record_dates = null;
    area.latest_month = null;
    expect(errors(file)).toEqual([]);
    file.format = "species/1.9";
    delete area.record_dates;
    delete area.latest_month;
    expect(errors(file)).toEqual([]);
  });

  test("region/1.1 ecoregions, valid or not", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/regions/us-zz.json"),
    );
    if (!file) throw new Error("missing fixture");
    const area = first(file.data.areas);
    file.format = "region/1.1";
    area.ecoregions = [
      {
        ecoregion: 342,
        name: "Southern Great Lakes forests",
        biome: "Temperate Broadleaf & Mixed Forests",
        share: 0.77,
      },
      {
        ecoregion: 329,
        name: "Appalachian mixed mesophytic forests",
        biome: "Temperate Broadleaf & Mixed Forests",
        share: 0.23,
      },
    ];
    expect(errors(file)).toEqual([]);
    area.ecoregions = [];
    expect(errors(file)).toEqual([]);
    area.ecoregions = [{ ecoregion: 342, name: "x", biome: "y", share: 0.04 }];
    expect(errors(file)).not.toEqual([]);
    area.ecoregions = [{ ecoregion: 0, name: "x", biome: "y", share: 0.5 }];
    expect(errors(file)).not.toEqual([]);
    area.ecoregions = [{ ecoregion: 342, name: "x", share: 0.5 }];
    expect(errors(file)).not.toEqual([]);
    file.format = "region/1.0";
    delete area.ecoregions;
    expect(errors(file)).toEqual([]);
  });

  test("region/1.2 daylight, 53 weeks of times and hours or null", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/regions/us-zz.json"),
    );
    if (!file) throw new Error("missing fixture");
    const area = first(file.data.areas);
    file.format = "region/1.2";
    area.daylight = Array.from({ length: 53 }, () => ["07:52", "17:20", 9.5]);
    expect(errors(file)).toEqual([]);
    (area.daylight as unknown[])[0] = null;
    expect(errors(file)).toEqual([]);
    area.daylight = Array.from({ length: 52 }, () => ["07:52", "17:20", 9.5]);
    expect(errors(file)).not.toEqual([]);
    area.daylight = Array.from({ length: 53 }, () => ["7:52", "17:20", 9.5]);
    expect(errors(file)).not.toEqual([]);
    area.daylight = Array.from({ length: 53 }, () => ["07:52", "17:20", 25]);
    expect(errors(file)).not.toEqual([]);
    file.format = "region/1.1";
    delete area.daylight;
    expect(errors(file)).toEqual([]);
  });

  test("region/1.3 temperature, 53 weeks of low and high or null", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/regions/us-zz.json"),
    );
    if (!file) throw new Error("missing fixture");
    const area = first(file.data.areas);
    file.format = "region/1.3";
    area.temperature = Array.from({ length: 53 }, () => [-4.2, 3.1]);
    expect(errors(file)).toEqual([]);
    (area.temperature as unknown[])[0] = null;
    expect(errors(file)).toEqual([]);
    area.temperature = Array.from({ length: 53 }, () => [-4.2]);
    expect(errors(file)).not.toEqual([]);
    area.temperature = Array.from({ length: 52 }, () => [-4.2, 3.1]);
    expect(errors(file)).not.toEqual([]);
    file.format = "region/1.2";
    delete area.temperature;
    expect(errors(file)).toEqual([]);
  });

  test("region/1.4 precipitation, land cover and elevation", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/regions/us-zz.json"),
    );
    if (!file) throw new Error("missing fixture");
    const area = first(file.data.areas);
    file.format = "region/1.4";
    area.precipitation = Array.from({ length: 53 }, () => 21.4);
    area.land_cover = {
      year: 2025,
      groups: [
        { group: "farmland", share: 48.2 },
        { group: "forest", share: 31 },
      ],
      classes: [{ class: 82, share: 40.1 }],
      water: 1.2,
    };
    area.elevation = { min: 207, median: 268, max: 360 };
    expect(errors(file)).toEqual([]);
    (area.precipitation as unknown[])[0] = null;
    area.land_cover = null;
    area.elevation = null;
    expect(errors(file)).toEqual([]);
    area.precipitation = Array.from({ length: 52 }, () => 21.4);
    expect(errors(file)).not.toEqual([]);
    area.precipitation = Array.from({ length: 53 }, () => -1);
    expect(errors(file)).not.toEqual([]);
    delete area.precipitation;
    area.land_cover = {
      year: 2025,
      groups: [{ group: "water", share: 10 }],
      classes: [],
      water: 0,
    };
    expect(errors(file)).not.toEqual([]);
    area.land_cover = { year: 2025, groups: [], classes: [], water: 101 };
    expect(errors(file)).not.toEqual([]);
    area.land_cover = null;
    area.elevation = { min: 207.5, median: 268, max: 360 };
    expect(errors(file)).not.toEqual([]);
    file.format = "region/1.3";
    delete area.land_cover;
    delete area.elevation;
    expect(errors(file)).toEqual([]);
  });

  test("region/1.5 warmth and frost", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/regions/us-zz.json"),
    );
    if (!file) throw new Error("missing fixture");
    const area = first(file.data.areas);
    file.format = "region/1.5";
    area.warmth = {
      through: "2026-10-12",
      degree_days: 3412,
      normal: 3290,
      days_ahead: 6,
      provisional: true,
    };
    area.frost = { last_spring: "04-22", first_fall: "10-19" };
    expect(errors(file)).toEqual([]);
    area.warmth = {
      through: "2026-02-01",
      degree_days: 12,
      normal: 9,
      days_ahead: null,
      provisional: false,
    };
    area.frost = { last_spring: null, first_fall: "10-19" };
    expect(errors(file)).toEqual([]);
    area.warmth = null;
    area.frost = null;
    expect(errors(file)).toEqual([]);
    area.warmth = {
      through: "2026-10-12",
      degree_days: 3412.5,
      normal: 3290,
      days_ahead: 6,
      provisional: false,
    };
    expect(errors(file)).not.toEqual([]);
    area.warmth = null;
    area.frost = { last_spring: "4-22", first_fall: "10-19" };
    expect(errors(file)).not.toEqual([]);
    area.frost = { last_spring: "13-01", first_fall: "10-19" };
    expect(errors(file)).not.toEqual([]);
    file.format = "region/1.4";
    delete area.warmth;
    delete area.frost;
    expect(errors(file)).toEqual([]);
  });

  test("region/1.6 green-up", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/regions/us-zz.json"),
    );
    if (!file) throw new Error("missing fixture");
    const area = first(file.data.areas);
    file.format = "region/1.6";
    area.green_up = {
      typical: "04-28",
      years: [2001, 2025],
      latest_year: 2025,
      latest: "05-04",
      days_later: 6,
    };
    expect(errors(file)).toEqual([]);
    area.green_up = null;
    expect(errors(file)).toEqual([]);
    area.green_up = {
      typical: "4-28",
      years: [2001, 2025],
      latest_year: 2025,
      latest: "05-04",
      days_later: 6,
    };
    expect(errors(file)).not.toEqual([]);
    area.green_up = {
      typical: "04-28",
      years: [2001],
      latest_year: 2025,
      latest: "05-04",
      days_later: 6,
    };
    expect(errors(file)).not.toEqual([]);
    file.format = "region/1.5";
    delete area.green_up;
    expect(errors(file)).toEqual([]);
  });

  test("region/1.7 full names", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/regions/us-zz.json"),
    );
    if (!file) throw new Error("missing fixture");
    const area = first(file.data.areas);
    file.format = "region/1.7";
    // Made-up name.
    area.full_name = "Example Parish";
    expect(errors(file)).toEqual([]);
    area.full_name = 7;
    expect(errors(file)).not.toEqual([]);
    delete area.full_name;
    file.format = "region/1.6";
    expect(errors(file)).toEqual([]);
  });

  test("region/1.8 watersheds and parks", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/regions/us-zz.json"),
    );
    if (!file) throw new Error("missing fixture");
    const area = first(file.data.areas);
    file.format = "region/1.8";
    expect(errors(file)).not.toEqual([]);
    area.watersheds = ["huc8-99990001"];
    area.parks = ["parks-example-metro-parks", "park-example-state-park"];
    expect(errors(file)).toEqual([]);
    area.watersheds = [];
    area.parks = [];
    expect(errors(file)).toEqual([]);
    area.watersheds = ["eco-342"];
    expect(errors(file)).not.toEqual([]);
    area.watersheds = [];
    area.parks = ["huc8-99990001"];
    expect(errors(file)).not.toEqual([]);
    delete area.watersheds;
    delete area.parks;
    file.format = "region/1.7";
    expect(errors(file)).toEqual([]);
  });

  test("species/1.16 place areas", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/species/EX1.json"),
    );
    if (!file) throw new Error("missing fixture");
    file.format = "species/1.16";
    file.data.concerns = [];
    file.data.recorded_in = [];
    file.data.part_photos = {};
    const areas = file.data.areas as Record<string, unknown>[];
    const state = first(areas);
    for (const [level, code] of [
      ["watershed", "huc8-99990001"],
      ["ecoregion", "eco-342"],
      ["park", "park-example-state-park"],
      ["park-system", "parks-example-metro-parks"],
    ] as const) {
      file.data.areas = [state, { ...state, level, area: code }];
      expect(errors(file), level).toEqual([]);
    }
    for (const [level, code] of [
      ["park-system", "park-example-state-park"],
      ["watershed", "eco-342"],
      ["county", "huc8-99990001"],
      ["city", "99001"],
    ] as const) {
      file.data.areas = [state, { ...state, level, area: code }];
      expect(errors(file), `${level} ${code}`).not.toEqual([]);
    }
  });

  test("manifest/2.1 counts place results", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/manifest.json"),
    );
    if (!file) throw new Error("missing fixture");
    const counts = file.data.counts as Record<string, unknown>;
    expect(errors(file)).toEqual([]);
    delete counts.place_results;
    expect(errors(file)).not.toEqual([]);
    file.format = "manifest/2.0";
    expect(errors(file)).toEqual([]);
  });

  test("places/1.0: each place's fields match its kind", async () => {
    const files = await published();
    const parks = (change: (places: Record<string, unknown>[]) => void) => {
      const file = structuredClone(
        files.get("releases/2026-01-05/places/parks.json"),
      );
      if (!file) throw new Error("missing fixture");
      change(file.data.places as Record<string, unknown>[]);
      return errors(file);
    };
    const park = (place: Record<string, unknown>) =>
      place.park as Record<string, unknown>;
    expect(parks(() => undefined)).toEqual([]);
    // A system with a page lists at least 5 species, a park without none.
    expect(
      parks(([, system]) => {
        (system?.species_keys as string[]).pop();
      }),
    ).not.toEqual([]);
    expect(
      parks(([state]) => {
        if (state) state.species_keys = ["EX1"];
      }),
    ).not.toEqual([]);
    expect(
      parks(([, system]) => {
        if (system) park(system).acres = 100;
      }),
    ).not.toEqual([]);
    expect(
      parks(([state]) => {
        if (state) park(state).parks = ["Example"];
      }),
    ).not.toEqual([]);
    expect(
      parks(([state]) => {
        if (state) park(state).type = "park-system";
      }),
    ).not.toEqual([]);
    expect(
      parks(([state]) => {
        if (state) state.park = null;
      }),
    ).not.toEqual([]);
    expect(
      parks(([state]) => {
        if (state) state.code = "99990001";
      }),
    ).not.toEqual([]);
    // Best weeks are spans of weeks 1 to 53, overall and by group.
    for (const best_weeks of [
      [16, 22],
      { all: [16, 54], groups: {} },
      { all: [16, 22], groups: { Birds: [17, 20] } },
      { all: [16, 22] },
    ])
      expect(
        parks(([, system]) => {
          if (system) system.best_weeks = best_weeks;
        }),
      ).not.toEqual([]);

    const watersheds = structuredClone(
      files.get("releases/2026-01-05/places/watersheds.json"),
    );
    if (!watersheds) throw new Error("missing fixture");
    const watershed = first(watersheds.data.places);
    expect(errors(watersheds)).toEqual([]);
    watershed.code = 99990001;
    expect(errors(watersheds)).not.toEqual([]);
    watershed.code = "99990001";
    watershed.best_weeks = [14, 30];
    expect(errors(watersheds)).not.toEqual([]);
    watershed.best_weeks = null;
    watersheds.data.kind = "parks";
    expect(errors(watersheds)).not.toEqual([]);
    watersheds.data.kind = "ecoregions";
    expect(errors(watersheds)).not.toEqual([]);
    Object.assign(watershed, {
      level: "ecoregion",
      area: "eco-342",
      code: 342,
    });
    expect(errors(watersheds)).toEqual([]);
  });

  test("place-boundaries/1.0: outlines for watersheds, points for parks", async () => {
    const files = await published();
    const points = structuredClone(
      files.get("releases/2026-01-05/places/parks/boundaries.json"),
    );
    const outlines = structuredClone(
      files.get("releases/2026-01-05/places/watersheds/boundaries.json"),
    );
    if (!points || !outlines) throw new Error("missing fixture");
    expect(errors(points)).toEqual([]);
    expect(errors(outlines)).toEqual([]);
    const outline = first(outlines.data.features);
    const point = first(points.data.features);
    points.data.features = [{ ...point, geometry: outline.geometry }];
    expect(errors(points)).not.toEqual([]);
    outlines.data.features = [{ ...outline, geometry: point.geometry }];
    expect(errors(outlines)).not.toEqual([]);
    (outline.properties as Record<string, unknown>).system =
      "parks-example-metro-parks";
    outlines.data.features = [outline];
    expect(errors(outlines)).not.toEqual([]);
  });

  test("place-labels/1.0 and place-weekly/1.0 are for places only", async () => {
    const files = await published();
    const labels = structuredClone(
      files.get("releases/2026-01-05/labels/parks-example-metro-parks.json"),
    );
    const result = structuredClone(
      files.get(
        "releases/2026-01-05/results/places/parks-example-metro-parks/EX1.json",
      ),
    );
    if (!labels || !result) throw new Error("missing fixture");
    expect(errors(labels)).toEqual([]);
    // Only the first three Backyard labels apply to a place.
    first(labels.data.species).labels = `m${"r".repeat(52)}`;
    expect(errors(labels)).not.toEqual([]);
    expect(errors(result)).toEqual([]);
    result.data.area = "99001";
    expect(errors(result)).not.toEqual([]);
  });

  test("a place's attribution is under attribution/places", async () => {
    const file = structuredClone(
      (await published()).get(
        "releases/2026-01-05/attribution/places/parks-example-metro-parks/EX1.json",
      ),
    );
    if (!file) throw new Error("missing fixture");
    expect(errors(file)).toEqual([]);
    file.id =
      "releases/2026-01-05/attribution/us-zz/parks-example-metro-parks/EX1.json";
    expect(errors(file)).not.toEqual([]);
  });

  test("a species/1.1 file needs no introductions", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/species/EX1.json"),
    );
    if (!file) throw new Error("missing fixture");
    file.format = "species/1.1";
    delete file.data.introductions;
    expect(errors(file)).toEqual([]);
  });

  test("species/1.15 identification results (ODR-2026-042)", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/species/EX1.json"),
    );
    if (!file) throw new Error("missing fixture");
    file.format = "species/1.15";
    file.data.concerns = [];
    file.data.recorded_in = [];
    file.data.part_photos = {};
    const result = { records: 31, season: [], season_withheld: "precision" };
    const area = first(file.data.areas);
    Object.assign(area, {
      male: result,
      female: null,
      signs: { gall: result },
      heard: { ...result, hours: Array.from({ length: 24 }, () => 1) },
      hours: Array.from({ length: 24 }, () => 2),
      months_not_reported: [1, 2, 12],
      land_cover: {
        records: 40,
        groups: [
          { group: "forest", share: 60 },
          { group: "water", share: 40 },
        ],
      },
      look_alikes: [
        { species_key: "EX2", state: 12, worldwide: 300, chosen_by: "state" },
      ],
    });
    expect(errors(file)).toEqual([]);
    area.hours = [1, 2, 3];
    expect(errors(file)).not.toEqual([]);
    area.hours = null;
    area.signs = { feathers: result };
    expect(errors(file)).not.toEqual([]);
    area.signs = {};
    area.months_not_reported = [13];
    expect(errors(file)).not.toEqual([]);
    area.months_not_reported = null;
    area.look_alikes = [
      { species_key: "EX2", state: 1, worldwide: 2, chosen_by: "ohio" },
    ];
    expect(errors(file)).not.toEqual([]);
    area.look_alikes = null;
    // part_photos is required from 1.15, absent from earlier files.
    delete file.data.part_photos;
    expect(errors(file)).not.toEqual([]);
    file.format = "species/1.14";
    expect(errors(file)).toEqual([]);
  });

  test("species/1.14 counties recorded without a result", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/species/EX1.json"),
    );
    if (!file) throw new Error("missing fixture");
    file.format = "species/1.14";
    file.data.concerns = [];
    file.data.recorded_in = ["99001", "99003"];
    expect(errors(file)).toEqual([]);
    file.data.recorded_in = ["us-zz"];
    expect(errors(file)).not.toEqual([]);
    // Required from 1.14, absent from earlier files.
    delete file.data.recorded_in;
    expect(errors(file)).not.toEqual([]);
    file.format = "species/1.13";
    expect(errors(file)).toEqual([]);
  });

  test("species/1.13 Ohio species of concern (ODR-2026-041)", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/species/EX1.json"),
    );
    if (!file) throw new Error("missing fixture");
    file.format = "species/1.13";
    // Made-up entry.
    file.data.concerns = [
      {
        list: "ohio",
        place: "us-zz",
        listed_name: "Examplea exampla",
        category: "special interest",
        list_name: "Example list",
        keeper: "Example keeper",
        edition: "June 2026",
      },
    ];
    expect(errors(file)).toEqual([]);
    first(file.data.concerns).category = "endangered";
    expect(errors(file)).not.toEqual([]);
    // Required from 1.13, absent from earlier files.
    delete file.data.concerns;
    expect(errors(file)).not.toEqual([]);
    file.format = "species/1.12";
    expect(errors(file)).toEqual([]);
  });

  test("species/1.12 Ohio listings", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/species/EX1.json"),
    );
    if (!file) throw new Error("missing fixture");
    file.format = "species/1.12";
    file.data.introductions = [
      {
        source: "us-riis-l48-v2",
        region: "us-l48",
        listed_name: "Example one",
        status: "introduced",
      },
      {
        source: "oh-oda-invasive-plants",
        region: "us-oh",
        listed_name: "Example one",
        status: "invasive",
      },
      {
        source: "inaturalist-checklist",
        region: "us-oh",
        listed_name: "Example one",
        status: "introduced",
      },
    ];
    expect(errors(file)).toEqual([]);
    file.data.introductions = [
      {
        source: "oh-odnr-aquatic-invasive",
        region: "us-in",
        listed_name: "Example one",
        status: "invasive",
      },
    ];
    expect(errors(file)).not.toEqual([]);
    file.data.introductions = [
      {
        source: "ohio",
        region: "us-oh",
        listed_name: "Example one",
        status: "invasive",
      },
    ];
    expect(errors(file)).not.toEqual([]);
  });

  test("a terms/1.0 file needs no scope", async () => {
    const file = structuredClone((await published()).get("terms.json"));
    if (!file) throw new Error("missing fixture");
    file.format = "terms/1.0";
    delete file.data.scope;
    expect(errors(file)).toEqual([]);
  });

  test("a species/1.4 file needs no finer identifications, and 1.3 no photo", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/species/EX1.json"),
    );
    if (!file) throw new Error("missing fixture");
    file.format = "species/1.4";
    delete file.data.below_species;
    expect(errors(file)).toEqual([]);
    file.format = "species/1.3";
    delete file.data.photo;
    expect(errors(file)).toEqual([]);
    file.format = "species/1.5";
    expect(errors(file)).not.toEqual([]);
  });

  test("a species photo and finer identification must be well formed", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/species/EX1.json"),
    );
    if (!file) throw new Error("missing fixture");
    file.data.photo = null;
    expect(errors(file)).toEqual([]);
    file.data.photo = { id: "not-a-photo" };
    expect(errors(file)).not.toEqual([]);
    file.data.photo = null;
    first(first(file.data.below_species).taxa).rank = "species";
    expect(errors(file)).not.toEqual([]);
  });

  test("a catalogue/1.1 file needs no photo", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/catalogue/0.json"),
    );
    if (!file) throw new Error("missing fixture");
    file.format = "catalogue/1.1";
    delete first(file.data.species).photo;
    expect(errors(file)).toEqual([]);
    file.format = "catalogue/1.2";
    expect(errors(file)).not.toEqual([]);
  });

  test("a catalogue/1.2 file needs no per-state sensitive, listed or introduced", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/catalogue/0.json"),
    );
    if (!file) throw new Error("missing fixture");
    file.format = "catalogue/1.2";
    const species = first(file.data.species);
    delete species.sensitive_in;
    delete species.listed_in;
    delete species.introduced_in;
    expect(errors(file)).toEqual([]);
    file.format = "catalogue/1.3";
    expect(errors(file)).not.toEqual([]);
  });

  test("a catalogue/1.3 file lists only state codes in its per-state fields", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/catalogue/0.json"),
    );
    if (!file) throw new Error("missing fixture");
    first(file.data.species).listed_in = ["99001"];
    expect(errors(file)).not.toEqual([]);
  });

  test("catalogue/1.4 stage seasons and invasive status (ODR-2026-037)", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/catalogue/0.json"),
    );
    if (!file) throw new Error("missing fixture");
    const species = first(file.data.species);
    // Made-up values.
    file.format = "catalogue/1.4";
    species.invasive_in = [];
    species.stage_seasons = {
      "us-zz": { flowering: [16, 18, 21], fruiting: [] },
    };
    expect(errors(file)).toEqual([]);
    species.stage_seasons = { "us-zz": {} };
    expect(errors(file)).toEqual([]);
    // Only the four stages, and a season is three weeks or none.
    species.stage_seasons = { "us-zz": { blooming: [16, 18, 21] } };
    expect(errors(file)).not.toEqual([]);
    species.stage_seasons = { "us-zz": { adult: [16, 18] } };
    expect(errors(file)).not.toEqual([]);
    species.stage_seasons = { "99001": {} };
    expect(errors(file)).not.toEqual([]);
    // Required from 1.4, absent from earlier files.
    delete species.stage_seasons;
    delete species.invasive_in;
    expect(errors(file)).not.toEqual([]);
    file.format = "catalogue/1.3";
    expect(errors(file)).toEqual([]);
  });

  test("catalogue/1.5 protection unconfirmed (data rules 1.50)", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/catalogue/0.json"),
    );
    if (!file) throw new Error("missing fixture");
    const species = first(file.data.species);
    // Made-up values.
    file.format = "catalogue/1.5";
    species.invasive_in = [];
    species.stage_seasons = {};
    species.protection_unconfirmed_in = ["us-zz"];
    expect(errors(file)).toEqual([]);
    species.protection_unconfirmed_in = ["99001"];
    expect(errors(file)).not.toEqual([]);
    // Required from 1.5, absent from earlier files.
    delete species.protection_unconfirmed_in;
    expect(errors(file)).not.toEqual([]);
    file.format = "catalogue/1.4";
    expect(errors(file)).toEqual([]);
  });

  test("backyard/1.2 stage seasons (ODR-2026-037)", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/backyard/us-zz/99001.json"),
    );
    if (!file) throw new Error("missing fixture");
    const species = first(file.data.species);
    file.format = "backyard/1.2";
    species.stages = { adult: [22, 26, 30], larva: [] };
    expect(errors(file)).toEqual([]);
    species.stages = { pupa: [22, 26, 30] };
    expect(errors(file)).not.toEqual([]);
    delete species.stages;
    expect(errors(file)).not.toEqual([]);
    file.format = "backyard/1.1";
    expect(errors(file)).toEqual([]);
  });

  test("catalogue/1.7 windows and conditions (data rules 1.72)", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/catalogue/0.json"),
    );
    if (!file) throw new Error("missing fixture");
    const species = first(file.data.species);
    // Made-up values.
    file.format = "catalogue/1.7";
    species.invasive_in = [];
    species.stage_seasons = {};
    species.protection_unconfirmed_in = [];
    species.windows = {
      "us-zz": [
        { records: 40, season: [14, 17, 20], season_withheld: null },
        { records: 12, season: [], season_withheld: "too-few-records" },
      ],
    };
    const medians = {
      sunrise: "06:24",
      sunset: "20:01",
      high: 25.6,
      low: 12.1,
      midpoint: null,
    };
    species.conditions = { "us-zz": medians };
    expect(errors(file)).toEqual([]);
    species.windows = { "us-zz": null };
    expect(errors(file)).toEqual([]);
    species.conditions = { "99001": medians };
    expect(errors(file)).not.toEqual([]);
    // Required from 1.7, absent from earlier files.
    delete species.conditions;
    expect(errors(file)).not.toEqual([]);
    delete species.windows;
    file.format = "catalogue/1.6";
    expect(errors(file)).toEqual([]);
  });

  test("backyard/1.3 windows and conditions (data rules 1.72)", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/backyard/us-zz/99001.json"),
    );
    if (!file) throw new Error("missing fixture");
    const species = first(file.data.species);
    // Made-up values.
    file.format = "backyard/1.3";
    species.stages = {};
    species.windows = null;
    species.conditions = {
      sunrise: "06:24",
      sunset: null,
      high: 25.6,
      low: 12.1,
      midpoint: 18.9,
    };
    expect(errors(file)).toEqual([]);
    species.conditions = null;
    expect(errors(file)).toEqual([]);
    species.conditions = { sunrise: "6am" };
    expect(errors(file)).not.toEqual([]);
    delete species.conditions;
    expect(errors(file)).not.toEqual([]);
    delete species.windows;
    file.format = "backyard/1.2";
    expect(errors(file)).toEqual([]);
  });

  test("a species/1.2 file needs no iNaturalist taxon ID", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/species/EX1.json"),
    );
    if (!file) throw new Error("missing fixture");
    file.format = "species/1.2";
    delete file.data.inaturalist_taxon_id;
    expect(errors(file)).toEqual([]);
  });

  test("a backyard/1.0 file needs no county records or seasons", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/backyard/us-zz/99001.json"),
    );
    if (!file) throw new Error("missing fixture");
    file.format = "backyard/1.0";
    const species = first(file.data.species);
    delete species.records;
    delete species.weekly;
    delete species.season;
    delete species.season_withheld;
    expect(errors(file)).toEqual([]);
  });

  test("a Backyard species without a county result has null records and weeks", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/backyard/us-zz/99001.json"),
    );
    if (!file) throw new Error("missing fixture");
    Object.assign(first(file.data.species), {
      records: null,
      weekly: null,
      season: [],
      season_withheld: null,
    });
    expect(errors(file)).toEqual([]);
  });

  test("fields a later minor version adds are allowed", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/methods.json"),
    );
    if (!file) throw new Error("missing fixture");
    file.data.added_later = true;
    file.format = "methods/1.7";
    expect(errors(file)).toEqual([]);
  });
});

describe("schemas reject", () => {
  const county = "releases/2026-01-05/results/us-zz/99001/EX1.json";
  const cases: [string, string, (file: Published) => void][] = [
    [
      "another major version",
      county,
      (f) => {
        f.format = "county-weekly/2.0";
      },
    ],
    [
      "the wrong kind",
      county,
      (f) => {
        f.kind = "state-weekly";
      },
    ],
    [
      "a missing field",
      county,
      (f) => {
        delete f.data.limits;
      },
    ],
    [
      "52 weeks of records",
      county,
      (f) => {
        (f.data.weekly as { records: number[] }).records.pop();
      },
    ],
    [
      "a negative count",
      county,
      (f) => {
        f.data.included_records = -1;
      },
    ],
    [
      "a season with a reason it is withheld",
      county,
      (f) => {
        f.data.season_withheld = "one-year";
      },
    ],
    [
      "an empty season with no reason",
      county,
      (f) => {
        f.data.season = [];
      },
    ],
    [
      "week 54",
      county,
      (f) => {
        f.data.season = [14, 22, 54];
      },
    ],
    [
      "a state code in a county result",
      county,
      (f) => {
        f.data.area = "us-zz";
      },
    ],
    [
      "a county at state level",
      "releases/2026-01-05/species/EX1.json",
      (f) => {
        first(f.data.areas).area = "99001";
      },
    ],
    [
      "null where a value is required",
      "releases/2026-01-05/species/EX1.json",
      (f) => {
        f.data.scientific_name = null;
      },
    ],
    [
      "a species/1.1 file without statuses",
      "releases/2026-01-05/species/EX1.json",
      (f) => {
        delete f.data.statuses;
      },
    ],
    [
      "a status from a list other than the government lists",
      "releases/2026-01-05/species/EX1.json",
      (f) => {
        first(f.data.statuses).list = "natureserve";
      },
    ],
    [
      "a status placed in a county",
      "releases/2026-01-05/species/EX1.json",
      (f) => {
        first(f.data.statuses).place = "99001";
      },
    ],
    [
      "a terms/1.1 file without scope",
      "terms.json",
      (f) => {
        delete f.data.scope;
      },
    ],
    [
      "a species/1.2 file without introductions",
      "releases/2026-01-05/species/EX1.json",
      (f) => {
        delete f.data.introductions;
      },
    ],
    [
      "an introduction from another source",
      "releases/2026-01-05/species/EX1.json",
      (f) => {
        first(f.data.introductions).source = "griis-canada";
      },
    ],
    [
      "an introduction saying native",
      "releases/2026-01-05/species/EX1.json",
      (f) => {
        first(f.data.introductions).status = "native";
      },
    ],
    [
      "a species/1.3 file without an iNaturalist taxon ID",
      "releases/2026-01-05/species/EX1.json",
      (f) => {
        delete f.data.inaturalist_taxon_id;
      },
    ],
    [
      "an iNaturalist taxon ID that is not a whole number",
      "releases/2026-01-05/species/EX1.json",
      (f) => {
        f.data.inaturalist_taxon_id = "12345";
      },
    ],
    [
      "a search name of an unknown kind",
      "releases/2026-01-05/search/index.json",
      (f) => {
        first(f.data.names)[1] = "nickname";
      },
    ],
    [
      "a backyard/1.1 species without its county records",
      "releases/2026-01-05/backyard/us-zz/99001.json",
      (f) => {
        delete first(f.data.species).records;
      },
    ],
    [
      "a Backyard species with weekly records that are not 53 weeks",
      "releases/2026-01-05/backyard/us-zz/99001.json",
      (f) => {
        first(f.data.species).weekly = [1, 2, 3];
      },
    ],
    [
      "a JSON file in the manifest without a format",
      "releases/2026-01-05/manifest.json",
      (f) => {
        first(f.data.files).format = null;
      },
    ],
    [
      "the archive in the manifest with a format",
      "releases/2026-01-05/manifest.json",
      (f) => {
        const files = f.data.files as Record<string, unknown>[];
        const archive = files.find((e) => e.path === "archive.tar.gz");
        if (archive === undefined) throw new Error("no archive");
        archive.format = "archive/1.0";
      },
    ],
    [
      "a catalogue/1.1 species without seasons",
      "releases/2026-01-05/catalogue/0.json",
      (f) => {
        delete first(f.data.species).seasons;
      },
    ],
    [
      "catalogue seasons keyed by a county",
      "releases/2026-01-05/catalogue/0.json",
      (f) => {
        first(f.data.species).seasons = { "99001": [14, 22, 35] };
      },
    ],
    [
      "a catalogue season of two weeks",
      "releases/2026-01-05/catalogue/0.json",
      (f) => {
        first(f.data.species).seasons = { "us-zz": [14, 22] };
      },
    ],
    [
      "a catalogue season of four weeks",
      "releases/2026-01-05/catalogue/0.json",
      (f) => {
        first(f.data.species).seasons = { "us-zz": [14, 22, 35, 40] };
      },
    ],
    [
      "Backyard labels for 52 weeks",
      "releases/2026-01-05/backyard/us-zz/99001.json",
      (f) => {
        first(f.data.species).labels = "n".repeat(52);
      },
    ],
    [
      "an unknown Backyard label",
      "releases/2026-01-05/backyard/us-zz/99001.json",
      (f) => {
        first(f.data.species).labels = `x${"n".repeat(52)}`;
      },
    ],
    [
      "a search name that is not a triple",
      "releases/2026-01-05/search/index.json",
      (f) => {
        first(f.data.names)[3] = "extra";
      },
    ],
    [
      "a place type other than city, village or cdp",
      "releases/2026-01-05/places/us-zz/cities.json",
      (f) => {
        first(f.data.cities).type = "township";
      },
    ],
    [
      "a ZIP code share above 1",
      "releases/2026-01-05/postal/us/999.json",
      (f) => {
        const zips = f.data.zips as Record<string, unknown>;
        first(zips["99901"])[1] = 1.5;
      },
    ],
    [
      "an uppercase SHA-256",
      "releases/2026-01-05/manifest.json",
      (f) => {
        const entry = first(f.data.files);
        entry.sha256 = String(entry.sha256).toUpperCase();
      },
    ],
    [
      "an id that is not the file's path",
      county,
      (f) => {
        f.id = "releases/2026-01-05/results/us-zz/EX1.json";
      },
    ],
    [
      "an id outside a release",
      "releases/2026-01-05/species/EX1.json",
      (f) => {
        f.id = "species/EX1.json";
      },
    ],
    [
      "a time without its zone",
      "current.json",
      (f) => {
        f.data.published_at = "2026-01-05T06:00:00";
      },
    ],
    [
      "a provenance without its run",
      "terms.json",
      (f) => {
        delete (f.provenance as Record<string, unknown>).run;
      },
    ],
  ];

  test.each(cases)("%s", async (_, path, change) => {
    const file = structuredClone((await published()).get(path));
    if (!file) throw new Error(`missing fixture ${path}`);
    expect(errors(file)).toEqual([]);
    change(file);
    expect(errors(file)).not.toEqual([]);
  });
});
