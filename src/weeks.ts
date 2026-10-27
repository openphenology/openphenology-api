// Weeks and Nearby labels as the data rules define them (data rules
// published.md and formats.md), so every reader counts weeks and names labels
// the same way the data was made.
import { WEEKS, type NearbyLabel } from "./types.ts";

/**
 * The week a date falls in, counted in UTC: week 1 is 1 to 7 January, week 2
 * is 8 to 14 January, and so on; week 53 is the last one or two days of the
 * year.
 *
 * @param date The date.
 * @returns The week, from 1 to 53.
 * @example
 * weekOf(new Date("2026-10-13")); // 41
 */
export function weekOf(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const day = Math.floor((date.getTime() - start) / 86_400_000);
  return Math.min(WEEKS, Math.floor(day / 7) + 1);
}

/** What each Nearby label letter means, in the data rules' words. */
export const NEARBY_LABELS: Readonly<Record<NearbyLabel, string>> = {
  c: "Commonly reported this time of year",
  s: "Seasonally reported",
  r: "Reported in your area",
  m: "Within its mapped range",
  n: "Not enough evidence",
};

/**
 * A species' Nearby label in one week.
 *
 * @param labels The species' `labels` string from a Nearby file.
 * @param week The week, from 1 to 53.
 * @returns The label letter.
 * @throws {RangeError} When the week is outside 1 to 53.
 * @example
 * NEARBY_LABELS[nearbyLabel(species.labels, weekOf(new Date()))];
 */
export function nearbyLabel(labels: string, week: number): NearbyLabel {
  if (!Number.isInteger(week) || week < 1 || week > WEEKS)
    throw new RangeError(`Invalid week: ${String(week)}`);
  const letter = labels.charAt(week - 1);
  return letter in NEARBY_LABELS ? (letter as NearbyLabel) : "n";
}
