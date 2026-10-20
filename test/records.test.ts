import { describe, expect, test } from "vitest";
import {
  idLinks,
  recordLinks,
  recordsCsv,
  type AttributionFile,
} from "../src/index.ts";

// Made-up attribution files in both format versions.
const file = (data: Partial<AttributionFile["data"]>): AttributionFile => ({
  id: "releases/2026-01-05/attribution/us-zz/EX1.json",
  kind: "attribution",
  format: "attribution/2.0",
  provenance: {} as AttributionFile["provenance"],
  data: {
    area: "us-zz",
    species_key: "EX1",
    datasets: [],
    gbif_download_dois: [],
    ...data,
  },
});

describe("record links", () => {
  test("add each entry's differences back up", () => {
    expect(
      idLinks({
        link: "https://www.gbif.org/occurrence/{id}",
        ids: [100, 5, 1],
      }),
    ).toEqual([
      "https://www.gbif.org/occurrence/100",
      "https://www.gbif.org/occurrence/105",
      "https://www.gbif.org/occurrence/106",
    ]);
  });

  test("join every kind of link, from either version", () => {
    const v2 = file({
      records: [
        { link: "https://www.inaturalist.org/observations/{id}", ids: [7, 3] },
        { link: "https://www.gbif.org/occurrence/{id}", ids: [42] },
      ],
    });
    expect(recordLinks(v2)).toEqual([
      "https://www.inaturalist.org/observations/7",
      "https://www.inaturalist.org/observations/10",
      "https://www.gbif.org/occurrence/42",
    ]);
    const v1 = file({ record_links: ["https://www.gbif.org/occurrence/1"] });
    expect(recordLinks(v1)).toEqual(["https://www.gbif.org/occurrence/1"]);
  });

  test("are null for a sensitive species, in either version", () => {
    expect(recordLinks(file({ records: null }))).toBeNull();
    expect(recordLinks(file({ record_links: null }))).toBeNull();
    expect(recordsCsv(file({ records: null }))).toBeNull();
  });

  test("make a CSV file with a link header and one row per record", () => {
    const csv = recordsCsv(
      file({
        records: [
          { link: "https://www.gbif.org/occurrence/{id}", ids: [1, 1] },
        ],
      }),
    );
    expect(csv).toBe(
      "link\r\nhttps://www.gbif.org/occurrence/1\r\nhttps://www.gbif.org/occurrence/2\r\n",
    );
    expect(
      recordsCsv(file({ record_links: ['https://example.test/a,"b"'] })),
    ).toBe('link\r\n"https://example.test/a,""b"""\r\n');
  });
});
