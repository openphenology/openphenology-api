// Writes each JSON Schema to schemas/<kind>-<major>.json. With --check, fails
// instead when a file is missing, out of date or no longer has a schema.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { MAJOR, schemas } from "../schemas/index.ts";

const check = process.argv.includes("--check");
const wanted = new Map(
  Object.entries(schemas).map(([kind, schema]) => [
    `${kind}-${String(MAJOR)}.json`,
    `${JSON.stringify(schema, null, 2)}\n`,
  ]),
);

const stale: string[] = [];
for (const name of readdirSync("schemas")) {
  if (name.endsWith(".json") && !wanted.has(name)) stale.push(name);
}
for (const [name, body] of wanted) {
  let current: string | undefined;
  try {
    current = readFileSync(`schemas/${name}`, "utf8");
  } catch {
    current = undefined;
  }
  if (current === body) continue;
  if (check) stale.push(name);
  else writeFileSync(`schemas/${name}`, body);
}

if (stale.length > 0) {
  console.error(
    `Out of date: ${stale.map((name) => `schemas/${name}`).join(", ")}. Run pnpm schemas.`,
  );
  process.exit(1);
}
console.log(
  `${String(wanted.size)} schemas ${check ? "up to date" : "written"}`,
);
