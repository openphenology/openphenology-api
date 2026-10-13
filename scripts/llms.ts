// Fails when llms.txt does not mention every public method of the client, so
// the summary for agents never falls behind the API.
import { readFileSync } from "node:fs";

const INTERNAL = new Set([
  "constructor",
  "getBytes",
  "getJson",
  "notFound",
  "unavailable",
]);
const summary = readFileSync("llms.txt", "utf8");
const source = readFileSync("src/client.ts", "utf8");
const methods = new Set(
  [...source.matchAll(/^ {2}(?:async )?([a-z][A-Za-z]+)\(/gm)]
    .map((match) => match[1] ?? "")
    .filter((name) => !INTERNAL.has(name)),
);
const missing = [...methods].filter((name) => !summary.includes(`${name}(`));
if (missing.length > 0) {
  console.error(`llms.txt does not mention: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`llms.txt mentions all ${String(methods.size)} public methods`);
