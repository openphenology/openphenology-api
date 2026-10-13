import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, test } from "vitest";
import { MAJOR, schemas } from "../schemas/index.ts";
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
      expect(schema.title).toBe(`OpenPhenology ${kind}/${String(MAJOR)}`);
    }
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
