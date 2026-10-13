import { describe, expect, test } from "vitest";
import { BACKYARD_LABELS, WEEKS, backyardLabel, weekOf } from "../src/index.ts";

describe("weeks", () => {
  test("week 1 is 1 to 7 January, week 2 starts on 8 January", () => {
    expect(weekOf(new Date("2026-01-01T00:00:00Z"))).toBe(1);
    expect(weekOf(new Date("2026-01-07T23:59:59Z"))).toBe(1);
    expect(weekOf(new Date("2026-01-08T00:00:00Z"))).toBe(2);
  });

  test("week 53 is the last one or two days of the year", () => {
    expect(weekOf(new Date("2026-12-30T12:00:00Z"))).toBe(52);
    expect(weekOf(new Date("2026-12-31T12:00:00Z"))).toBe(WEEKS);
    expect(weekOf(new Date("2028-12-30T12:00:00Z"))).toBe(WEEKS);
    expect(weekOf(new Date("2028-12-31T12:00:00Z"))).toBe(WEEKS);
  });

  test("weeks are counted in UTC", () => {
    expect(weekOf(new Date("2026-01-08T01:00:00+02:00"))).toBe(1);
  });
});

describe("Backyard labels", () => {
  const labels = `${"n".repeat(10)}c${"s".repeat(41)}m`;

  test("reads a week's label and names it", () => {
    expect(backyardLabel(labels, 11)).toBe("c");
    expect(BACKYARD_LABELS[backyardLabel(labels, 11)]).toBe(
      "Commonly reported this time of year",
    );
    expect(backyardLabel(labels, 53)).toBe("m");
  });

  test("an unknown letter reads as not enough evidence", () => {
    expect(backyardLabel("x".repeat(53), 1)).toBe("n");
  });

  test("refuses a week outside 1 to 53", () => {
    expect(() => backyardLabel(labels, 0)).toThrow(RangeError);
    expect(() => backyardLabel(labels, 54)).toThrow(RangeError);
    expect(() => backyardLabel(labels, 1.5)).toThrow(RangeError);
  });
});
