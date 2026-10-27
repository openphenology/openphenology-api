// Fails when the built package grows past its gzip size budgets. The build
// strips comments from the .js files, so the budgets measure code only.
import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";

// The search entry (ODR-2026-070) loads only when release.search() is first
// called, so it has its own budget and is left out of the core's.
const SEARCH = "search.js";
const BUDGETS = [
  // 5.5 KB from 2026-10-20, owner-approved for the record-link readers
  // (ODR-2026-052); the site keeps its own byte ceiling and speed tests.
  {
    name: `dist/*.js but ${SEARCH}`,
    budget: 5.5 * 1024,
    files: (name) => name !== SEARCH,
  },
  // 4.8 KB: its measured 4,804 bytes on 2026-10-27 with stage, status and
  // option counts (ODR-2026-071), and about 100 bytes. It was 3.75 KB.
  {
    name: `dist/${SEARCH}`,
    budget: 4.8 * 1024,
    files: (name) => name === SEARCH,
  },
];

let over = false;
for (const { name, budget, files } of BUDGETS) {
  const source = readdirSync("dist")
    .filter((file) => file.endsWith(".js") && files(file))
    .map((file) => readFileSync(`dist/${file}`))
    .reduce((all, file) => Buffer.concat([all, file]), Buffer.alloc(0));
  const size = gzipSync(source).length;
  console.log(
    `${name}: ${String(size)} bytes gzipped (budget ${String(budget)})`,
  );
  if (size > budget) over = true;
}
if (over) process.exit(1);
