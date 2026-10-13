// Fails when the built package grows past its gzip size budget. The build
// strips comments from the .js files, so the budget measures code only.
import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";

const BUDGET = 5 * 1024;
const source = readdirSync("dist")
  .filter((name) => name.endsWith(".js"))
  .map((name) => readFileSync(`dist/${name}`))
  .reduce((all, file) => Buffer.concat([all, file]), Buffer.alloc(0));
const size = gzipSync(source).length;
console.log(
  `dist/*.js: ${String(size)} bytes gzipped (budget ${String(BUDGET)})`,
);
if (size > BUDGET) process.exit(1);
