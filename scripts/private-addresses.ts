// Fails when anything this public repository holds names OpenPhenology's
// non-public environment or its addresses (owner, 2026-11-14): every tracked
// file, and in a pull request its title, description and commit messages.
// The word is built from parts so this file does not match itself.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const WORD = ["st", "aging"].join("");

/** What may never appear: the word itself, and a hosting preview address. */
export const PRIVATE = [
  new RegExp(WORD, "i"),
  /\.workers\.dev\b/i,
  /\.pages\.dev\b/i,
];

/** Each line of `text` that matches, as `where:line: text`. */
export function matches(where: string, text: string): string[] {
  return text
    .split("\n")
    .flatMap((line, i) =>
      PRIVATE.some((pattern) => pattern.test(line))
        ? [`${where}:${String(i + 1)}: ${line.trim().slice(0, 160)}`]
        : [],
    );
}

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 });

if (process.argv[1]?.endsWith("private-addresses.ts")) {
  const found: string[] = [];
  for (const file of git("ls-files", "-z").split("\0").filter(Boolean)) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    found.push(...matches(file, text));
  }
  // In a pull request (ci.yml): its title, description and commit messages.
  const { PR_TITLE, PR_BODY, PR_BASE } = process.env;
  if (PR_TITLE !== undefined) found.push(...matches("title", PR_TITLE));
  if (PR_BODY !== undefined) found.push(...matches("description", PR_BODY));
  if (PR_BASE !== undefined && PR_BASE !== "")
    found.push(
      ...matches("commits", git("log", "--format=%H %B", `${PR_BASE}..HEAD`)),
    );
  if (found.length > 0) {
    console.error(
      `A public repository must not name the non-public environment or its addresses:\n${found.join("\n")}`,
    );
    process.exit(1);
  }
}
