import { describe, expect, test } from "vitest";
import { countyState } from "../src/states.ts";

describe("countyState", () => {
  test.each([
    ["39049", "us-oh"],
    ["01001", "us-al"],
    ["11001", "us-dc"],
    ["56045", "us-wy"],
    ["72001", "us-pr"],
    ["78010", "us-vi"],
  ])("county %s is in %s", (county, state) => {
    expect(countyState(county)).toBe(state);
  });

  test("an unknown Census code has no state", () => {
    expect(countyState("03001")).toBeNull();
    expect(countyState("99001")).toBeNull();
  });

  test("every state, DC and the five inhabited territories", () => {
    const states = new Set<string>();
    for (let code = 0; code < 100; code++) {
      const state = countyState(`${String(code).padStart(2, "0")}001`);
      if (state) states.add(state);
    }
    expect(states.size).toBe(56);
  });
});
