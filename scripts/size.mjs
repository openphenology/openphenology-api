// Fails when the built package grows past its gzip size budget. The build
// strips comments from the .js files, so the budget measures code only.
import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";

// 5.5 KB from 2026-10-20, owner-approved for the record-link readers
// (ODR-2026-052); the site keeps its own byte ceiling and speed tests.
const BUDGET = 5.5 * 1024;
const source = readdirSync("dist")
  .filter((name) => name.endsWith(".js"))
  .map((name) => readFileSync(`dist/${name}`))
  .reduce((all, file) => Buffer.concat([all, file]), Buffer.alloc(0));
const size = gzipSync(source).length;
console.log(
  `dist/*.js: ${String(size)} bytes gzipped (budget ${String(BUDGET)})`,
);
if (size > BUDGET) process.exit(1);
