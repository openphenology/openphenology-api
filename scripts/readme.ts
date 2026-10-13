// Type-checks every TypeScript and JavaScript example in README.md against the
// package's own source, so the examples can't drift from the API. Each block
// becomes its own file in .readme/; names a block uses but does not define,
// such as `release` in the examples after the quick start, are declared.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const DIR = ".readme";
const PRELUDE: Record<string, string> = {
  createClient: 'import { createClient } from "../src/index.ts";',
  release: 'declare const release: import("../src/index.ts").Release;',
  map: "declare const map: { addSource(id: string, source: unknown): void };",
  signal: "declare const signal: AbortSignal;",
};

const readme = readFileSync("README.md", "utf8");
const blocks = [...readme.matchAll(/```(?:ts|js)\n([\s\S]*?)```/g)].map(
  (match) => match[1] ?? "",
);

rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR);
blocks.forEach((block, i) => {
  const code = block
    .replace(/^ {3}/gm, "")
    .replaceAll('"@openphenology/api/schemas/', '"../schemas/')
    .replaceAll('"@openphenology/api"', '"../src/index.ts"');
  const declared = Object.entries(PRELUDE)
    .filter(
      ([name]) =>
        new RegExp(`\\b${name}\\b`).test(code) &&
        !new RegExp(`(const|let|import \\{[^}]*) ${name}\\b`).test(code),
    )
    .map(([, line]) => line);
  writeFileSync(
    `${DIR}/block-${String(i + 1)}.ts`,
    `${declared.join("\n")}\n${code}\nexport {};\n`,
  );
});
writeFileSync(
  `${DIR}/tsconfig.json`,
  JSON.stringify({
    extends: "../tsconfig.json",
    compilerOptions: { resolveJsonModule: true, noUnusedLocals: false },
    include: ["*.ts"],
  }),
);

try {
  execFileSync("tsc", ["--noEmit", "-p", DIR], { stdio: "inherit" });
} catch {
  console.error(
    "A README example no longer type-checks; see the errors above.",
  );
  process.exit(1);
}
rmSync(DIR, { recursive: true, force: true });
console.log(`${String(blocks.length)} README examples type-check`);
