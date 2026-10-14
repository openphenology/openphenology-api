// Writes postman/openphenology.postman_collection.json: one request per
// published file kind, described from the JSON Schemas, with each kind's
// made-up example as a saved response and scripts/postman-sandbox.js as its
// test. With --check, fails instead when the file is out of date, a kind has
// no request, or the collection does not match Postman's collection schema
// (a copy of https://schema.getpostman.com/json/collection/v2.1.0/collection.json,
// Apache-2.0, kept in scripts/ so the check needs no network).
import { readFileSync, writeFileSync } from "node:fs";
import ajvDraft04 from "ajv-draft-04";
import { MAJOR, schemas } from "../schemas/index.ts";

const COLLECTION = "postman/openphenology.postman_collection.json";

interface Request {
  readonly kind: keyof typeof schemas;
  readonly name: string;
  /** Path from the API root; `{{…}}` are collection variables. */
  readonly path: string;
  /** What each code in the path is. */
  readonly codes?: readonly string[];
  /** Lines run on the checked file, to save values for later requests. */
  readonly saves?: string;
  /** What `saves` does, for the description. */
  readonly savesNote?: string;
  readonly pre?: string;
}

const IN_RELEASE = "releases/{{release}}";
const STATE = "`{{state}}`: a state code, `us-` and the postal abbreviation";
const COUNTY = "`{{county}}`: a county's 5-digit Census code (GEOID)";
const SPECIES = "`{{species}}`: a species key, from the catalogue";

const FOLDERS: readonly (readonly [string, string, readonly Request[]])[] = [
  [
    "1. Start here",
    "Outside any release: which release is current, every release, and the terms. Send `current.json` first; it saves the current release into `{{release}}`.",
    [
      {
        kind: "current",
        name: "Current release",
        path: "current.json",
        saves: 'pm.collectionVariables.set("release", file.data.release);',
        savesNote: "Saves the current release into `{{release}}`.",
      },
      { kind: "releases", name: "Every release", path: "releases.json" },
      { kind: "terms", name: "Terms", path: "terms.json" },
    ],
  ],
  [
    "2. The release",
    "About the release in `{{release}}`: its files, what changed, the method and the sources.",
    [
      {
        kind: "manifest",
        name: "Manifest",
        path: `${IN_RELEASE}/manifest.json`,
      },
      { kind: "notes", name: "Notes", path: `${IN_RELEASE}/notes.json` },
      { kind: "methods", name: "Methods", path: `${IN_RELEASE}/methods.json` },
      { kind: "sources", name: "Sources", path: `${IN_RELEASE}/sources.json` },
    ],
  ],
  [
    "3. Species",
    "Every species, and ways to find one.",
    [
      {
        kind: "catalogue",
        name: "Catalogue",
        path: `${IN_RELEASE}/catalogue.json`,
        saves: [
          'const state = pm.variables.get("state");',
          "const first = file.data.species.find((s) => s.states.includes(state));",
          'if (first) pm.collectionVariables.set("species", first.species_key);',
        ].join("\n"),
        savesNote:
          "Saves the first species with a result in `{{state}}` into `{{species}}`.",
      },
      {
        kind: "species",
        name: "Species",
        path: `${IN_RELEASE}/species/{{species}}.json`,
        codes: [SPECIES],
      },
      { kind: "slugs", name: "Slugs", path: `${IN_RELEASE}/slugs.json` },
      { kind: "groups", name: "Groups", path: `${IN_RELEASE}/groups.json` },
      {
        kind: "search",
        name: "Search names",
        path: `${IN_RELEASE}/search/index.json`,
      },
    ],
  ],
  [
    "4. Places",
    "States, counties and ZIP codes.",
    [
      {
        kind: "region",
        name: "Region",
        path: `${IN_RELEASE}/regions/{{state}}.json`,
        codes: [STATE],
        saves: [
          'const county = pm.variables.get("county");',
          "const area = file.data.areas.find((a) => a.area === county);",
          'if (area && area.species_keys.length > 0) pm.collectionVariables.set("species", area.species_keys[0]);',
        ].join("\n"),
        savesNote:
          "Saves the first species with a result in `{{county}}` into `{{species}}`, so the county's results below exist.",
      },
      {
        kind: "boundaries",
        name: "County outlines",
        path: `${IN_RELEASE}/places/{{state}}/boundaries.json`,
        codes: [STATE],
      },
      {
        kind: "postal",
        name: "ZIP codes",
        path: `${IN_RELEASE}/postal/us/{{zipPrefix}}.json`,
        codes: [
          "`{{zipPrefix}}`: the first 3 digits of `{{zip}}`, set before sending",
        ],
        pre: 'pm.variables.set("zipPrefix", String(pm.variables.get("zip")).slice(0, 3));',
      },
    ],
  ],
  [
    "5. Results",
    "When a species is recorded, week by week, and where the records came from.",
    [
      {
        kind: "state-weekly",
        name: "State result",
        path: `${IN_RELEASE}/results/{{state}}/{{species}}.json`,
        codes: [STATE, SPECIES],
      },
      {
        kind: "county-weekly",
        name: "County result",
        path: `${IN_RELEASE}/results/{{state}}/{{county}}/{{species}}.json`,
        codes: [STATE, COUNTY, SPECIES],
      },
      {
        kind: "backyard",
        name: "Backyard",
        path: `${IN_RELEASE}/backyard/{{state}}/{{county}}.json`,
        codes: [STATE, COUNTY],
      },
      {
        kind: "attribution",
        name: "Attribution",
        path: `${IN_RELEASE}/attribution/{{state}}/{{species}}.json`,
        codes: [
          STATE,
          SPECIES,
          "For a county, add it before the species: `attribution/{{state}}/{{county}}/{{species}}.json`",
        ],
      },
    ],
  ],
];

/** Kinds that are never split into shards (data rules `formats.md`). */
const WHOLE = new Set([
  "current",
  "terms",
  "manifest",
  "methods",
  "state-weekly",
  "county-weekly",
]);

const NOTES = `**Beta.** OpenPhenology is in beta: requests may change before 1.0.0, while published file formats change only by version.

Every file OpenPhenology publishes: when each species is recorded, week by week, in US counties and states. Generated from [openphenology-api](https://github.com/openphenology/openphenology-api); see \`postman/README.md\` there.

- **No keys or accounts.** Every request is a plain \`GET\`.
- **Releases never change.** Files under \`releases/<date>/\` stay the same for good. \`current.json\` names the current release.
- **A 404 means the file isn't published**: the species, county or state has no such file in this release.
- **Large files are split into shards.** When a file is too large, it is published as \`<name>/0.json\`, \`<name>/1.json\` and so on, and the unsplit file is not published. The Catalogue's saved example is shard 0. Each request's test checks shard 0 when the unsplit file isn't there.
- **Licence:** CC BY 4.0. \`terms.json\` says how to cite the data and credit its sources.

**Variables.** \`baseUrl\` is the API. \`release\`, \`state\`, \`county\`, \`species\` and \`zip\` start with made-up but valid values. Run the collection from the top and it fills in \`release\` and \`species\` itself.

**Tests.** Each request checks that its file loads, is the expected kind and major format version, and matches its JSON Schema from the release's \`schemas/\` folder.`;

const SANDBOX = readFileSync("scripts/postman-sandbox.js", "utf8");

const lines = (text: string): string[] => text.split("\n");

const example = (kind: string): string =>
  readFileSync(`schemas/examples/${kind}-${String(MAJOR)}.json`, "utf8");

function item(request: Request) {
  const description = schemas[request.kind].description as string;
  const url = {
    raw: `{{baseUrl}}/${request.path}`,
    host: ["{{baseUrl}}"],
    path: request.path.split("/"),
  };
  const docs = [
    description,
    "",
    `Path: \`${request.path}\`. Format: \`${request.kind}/${String(MAJOR)}\`, schema \`schemas/${request.kind}-${String(MAJOR)}.json\`.`,
    ...(request.codes ?? []).map((code) => `- ${code}`),
    ...(request.savesNote === undefined ? [] : ["", request.savesNote]),
  ];
  const test = [
    `const KIND = ${JSON.stringify(request.kind)};`,
    `const SPLIT = ${String(!WHOLE.has(request.kind))};`,
    "function saved(file) {",
    ...(request.saves === undefined
      ? ["  // Nothing to save."]
      : lines(request.saves).map((line) => `  ${line}`)),
    "}",
    "",
    ...lines(SANDBOX.trimEnd()),
  ];
  return {
    name: request.name,
    event: [
      ...(request.pre === undefined
        ? []
        : [
            {
              listen: "prerequest",
              script: { type: "text/javascript", exec: lines(request.pre) },
            },
          ]),
      { listen: "test", script: { type: "text/javascript", exec: test } },
    ],
    request: {
      method: "GET",
      header: [],
      url,
      description: docs.join("\n"),
    },
    response: [
      {
        name: "Example (made up)",
        originalRequest: { method: "GET", header: [], url },
        status: "OK",
        code: 200,
        _postman_previewlanguage: "json",
        header: [{ key: "Content-Type", value: "application/json" }],
        body: example(request.kind).trimEnd(),
      },
    ],
  };
}

function collection() {
  return {
    info: {
      name: "OpenPhenology",
      description: NOTES,
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: [
      ...FOLDERS.map(([name, description, requests]) => ({
        name,
        description,
        item: requests.map(item),
      })),
      {
        name: "6. Schemas",
        description:
          "The JSON Schema for each format, as each release copies it from this package. Set `file` in Params to another `<kind>-1.json`.",
        item: [
          {
            name: "Schema",
            event: [
              {
                listen: "test",
                script: {
                  type: "text/javascript",
                  exec: [
                    'pm.test("Is a JSON Schema 2020-12", () => {',
                    "  pm.response.to.have.status(200);",
                    "  pm.expect(pm.response.json().$schema).to.equal(",
                    '    "https://json-schema.org/draft/2020-12/schema",',
                    "  );",
                    "});",
                  ],
                },
              },
            ],
            request: {
              method: "GET",
              header: [],
              url: {
                raw: `{{baseUrl}}/${IN_RELEASE}/schemas/:file`,
                host: ["{{baseUrl}}"],
                path: [...IN_RELEASE.split("/"), "schemas", ":file"],
                variable: [
                  {
                    key: "file",
                    value: `catalogue-${String(MAJOR)}.json`,
                    description: "`<kind>-<major>.json`",
                  },
                ],
              },
              description:
                "A format's JSON Schema, with every field described. `all-1.json` holds them all, by kind.",
            },
          },
        ],
      },
    ],
    variable: [
      ["baseUrl", "https://api.openphenology.com", "The API."],
      ["release", "2026-10-19", "A release ID, its date."],
      ["state", "us-oh", "A state code."],
      ["county", "39049", "A county's 5-digit Census code."],
      ["species", "example-species", "A species key."],
      ["zip", "43215", "A 5-digit ZIP code."],
    ].map(([key, value, description]) => ({
      key,
      value,
      type: "string",
      description,
    })),
  };
}

/** Kinds with no request in the collection. */
function missingKinds(): string[] {
  const covered = new Set(
    FOLDERS.flatMap(([, , requests]) => requests.map((r) => r.kind)),
  );
  return Object.keys(schemas).filter((kind) => !covered.has(kind as never));
}

const body = `${JSON.stringify(collection(), null, 2)}\n`;

if (process.argv.includes("--check")) {
  const problems: string[] = [];
  const missing = missingKinds();
  if (missing.length > 0) problems.push(`no request for ${missing.join(", ")}`);
  let current = "";
  try {
    current = readFileSync(COLLECTION, "utf8");
  } catch {
    problems.push(`${COLLECTION} is missing`);
  }
  if (current !== "" && current !== body)
    problems.push(`${COLLECTION} is out of date; run pnpm postman`);
  const postman = JSON.parse(
    readFileSync("scripts/postman-collection-v2.1.0.schema.json", "utf8"),
  ) as object;
  const validate = new ajvDraft04.default({
    allErrors: true,
    strict: false,
  }).compile(postman);
  if (!validate(JSON.parse(body)))
    problems.push(
      `not a valid Postman v2.1 collection: ${JSON.stringify(validate.errors)}`,
    );
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(
    `${COLLECTION} is up to date and covers all ${String(Object.keys(schemas).length)} file kinds`,
  );
} else {
  writeFileSync(COLLECTION, body);
  console.log(`wrote ${COLLECTION}`);
}
