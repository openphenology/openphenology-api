// Writes each JSON Schema to schemas/<kind>-<major>.json, with its fields
// described from src/types.ts, all of them by kind to schemas/all-1.json,
// and one made-up example file per format to
// schemas/examples/<kind>-<major>.json. With --check, fails instead when a
// file is missing, out of date or no longer has a source.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { majorOf, schemas } from "../schemas/index.ts";
import { fakeServer } from "../test/fixture.ts";
import { describe } from "./describe.ts";

/** JSON with two-space indents, keeping lists of plain values on one line. */
function pretty(value: unknown, indent = ""): string {
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || typeof item !== "object"))
      return JSON.stringify(value).replaceAll(",", ", ");
    const inner = `${indent}  `;
    return `[\n${value.map((item) => inner + pretty(item, inner)).join(",\n")}\n${indent}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    const inner = `${indent}  `;
    return `{\n${entries
      .map(
        ([key, item]) =>
          `${inner}${JSON.stringify(key)}: ${pretty(item, inner)}`,
      )
      .join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}

const name = (kind: string) => `${kind}-${String(majorOf(kind))}.json`;
const wanted = new Map<string, string>();
for (const [kind, schema] of Object.entries(schemas))
  wanted.set(
    `schemas/${name(kind)}`,
    `${JSON.stringify(describe(kind, schema), null, 2)}\n`,
  );

// Every schema in one file, by kind, for readers that list the formats.
const all: Record<string, unknown> = {};
for (const kind of Object.keys(schemas)) {
  const body = wanted.get(`schemas/${name(kind)}`);
  if (body !== undefined) all[kind] = JSON.parse(body);
}
// Its name stays all-1.json, where readers already find it, although
// manifest's entry is manifest-2.json.
wanted.set("schemas/all-1.json", `${JSON.stringify(all, null, 2)}\n`);

// The first made-up file of each kind in the test release.
const server = await fakeServer();
for (const body of server.files.values()) {
  const file = JSON.parse(body) as { kind: string };
  const path = `schemas/examples/${name(file.kind)}`;
  if (!wanted.has(path)) wanted.set(path, `${pretty(file)}\n`);
}

// Each published schema must compile in strict mode and accept its example.
const ajv = new Ajv2020({ strict: true, allErrors: true });
for (const kind of Object.keys(schemas)) {
  const schema = wanted.get(`schemas/${name(kind)}`);
  const example = wanted.get(`schemas/examples/${name(kind)}`);
  if (schema === undefined || example === undefined)
    throw new Error(`${kind}: no schema or no example`);
  const validate = ajv.compile(JSON.parse(schema) as object);
  if (!validate(JSON.parse(example)))
    throw new Error(`${kind}: example fails its schema`);
}

const check = process.argv.includes("--check");
const stale: string[] = [];
mkdirSync("schemas/examples", { recursive: true });
for (const dir of ["schemas", "schemas/examples"]) {
  for (const file of readdirSync(dir)) {
    const path = `${dir}/${file}`;
    if (file.endsWith(".json") && !wanted.has(path)) stale.push(path);
  }
}
for (const [path, body] of wanted) {
  let current: string | undefined;
  try {
    current = readFileSync(path, "utf8");
  } catch {
    current = undefined;
  }
  if (current === body) continue;
  if (check) stale.push(path);
  else writeFileSync(path, body);
}

if (stale.length > 0) {
  console.error(`Out of date: ${stale.join(", ")}. Run pnpm schemas.`);
  process.exit(1);
}
console.log(
  `${String(wanted.size)} schemas and examples ${check ? "up to date" : "written"}`,
);
