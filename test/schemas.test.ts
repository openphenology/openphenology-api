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

  test("a species/1.1 file needs no introductions", async () => {
    const file = structuredClone(
      (await published()).get("releases/2026-01-05/species/EX1.json"),
    );
    if (!file) throw new Error("missing fixture");
    file.format = "species/1.1";
    delete file.data.introductions;
    expect(errors(file)).toEqual([]);
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
