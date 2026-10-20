// Record links from attribution files (data rules formats.md, ODR-2026-052):
// `attribution/2.0` stores each kind of link once and the records' numbers
// as differences, so every reader rebuilds the same full links.
import type { AttributionFile, RecordIds } from "./types.ts";

/**
 * The full links of one `attribution/2.0` entry: its numbers added back up,
 * each put in place of `{id}`.
 *
 * @param entry One kind of link and its records' numbers.
 * @returns The links, in ascending record order.
 * @example
 * idLinks({ link: "https://www.gbif.org/occurrence/{id}", ids: [100, 5] });
 * // ["https://www.gbif.org/occurrence/100", "https://www.gbif.org/occurrence/105"]
 */
export function idLinks(entry: RecordIds): string[] {
  const links: string[] = [];
  let id = 0;
  for (const step of entry.ids) {
    id += step;
    links.push(entry.link.replace("{id}", String(id)));
  }
  return links;
}

/**
 * The links to the records behind a result, from either format version.
 *
 * @param file An attribution file.
 * @returns Every record's link, or `null` for a sensitive species, whose
 *   records are credited by dataset and GBIF download DOI only.
 */
export function recordLinks(file: AttributionFile): string[] | null {
  const { records, record_links } = file.data;
  if (records !== undefined) return records && records.flatMap(idLinks);
  return record_links === undefined || record_links === null
    ? null
    : [...record_links];
}

/**
 * The records behind a result as a CSV file: a `link` header, then one row
 * per record.
 *
 * @param file An attribution file.
 * @returns The CSV text, or `null` for a sensitive species.
 */
export function recordsCsv(file: AttributionFile): string | null {
  const links = recordLinks(file);
  if (links === null) return null;
  // RFC 4180: a value holding a comma, quote or line break is quoted.
  const cell = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return ["link", ...links].map(cell).join("\r\n") + "\r\n";
}
