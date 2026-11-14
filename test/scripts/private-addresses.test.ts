import { describe, expect, it } from "vitest";
import { matches } from "../../scripts/private-addresses.ts";

const word = ["st", "aging"].join("");
const preview = (host: string) => `x.${host}.${["d", "ev"].join("")}`;

describe("the public repository's text", () => {
  it("never names the non-public environment or a preview address", () => {
    expect(
      matches("a.md", `see https://api-${word}.example.org/\nfine`),
    ).toEqual([`a.md:1: see https://api-${word}.example.org/`]);
    expect(matches("t", word.toUpperCase())).toHaveLength(1);
    expect(matches("t", preview("workers"))).toHaveLength(1);
    expect(matches("t", preview("pages"))).toHaveLength(1);
    expect(
      matches(
        "t",
        "https://api.openphenology.com/ and @vitest/browser-preview",
      ),
    ).toEqual([]);
  });
});
