import { describe, expect, test } from "vitest";
import { createClient, type SearchInput } from "../src/index.ts";
import { search as searchEntry } from "../src/search.ts";
import { fakeServer } from "./fixture.ts";
import { searchFiles } from "./search-fixture.ts";

const BASE = "https://example.test/";

async function open() {
  const server = await fakeServer(searchFiles);
  const client = createClient({ baseUrl: BASE, fetch: server.fetch });
  const release = await client.release();
  return { server, release };
}

async function search(input: SearchInput) {
  const { release } = await open();
  return release.search(input);
}

/** The common names, else the scientific names, of the species found. */
const named = async (input: SearchInput) =>
  (await search(input)).species.map(
    (s) => s.entry.common_name ?? s.entry.scientific_name,
  );

/** The matched names, as the site's ranking test lists them. */
const matched = async (text: string) =>
  (await search({ text })).species.map((s) => s.matched?.[0]);

// The site's ranking (apps#54, apps test/search.test.ts), on its made-up
// index: exact, starts with, a word starts with, contains; alphabetical by
// display name within a tier; never by popularity or record counts.
describe("by name", () => {
  test("lists oaks before Mourning Cloak", async () => {
    expect(await matched("oak")).toEqual([
      "Oak-leaf hydrangea",
      "Northern red oak",
      "White oak",
      "Mourning Cloak",
    ]);
  });

  test("puts an exact scientific name first", async () => {
    expect((await matched("quercus rubra"))[0]).toBe("Quercus rubra");
  });

  test("orders by display name within a tier", async () => {
    expect(await matched("Quercus")).toEqual(["Quercus rubra", "Quercus alba"]);
    expect(await matched("robin")).toEqual([
      "Robin's plantain",
      "American robin",
    ]);
  });

  test("finds a species by a former or other name, once, and says which", async () => {
    const formerly = await search({ text: "ranunculus scelerata" });
    expect(formerly.species).toHaveLength(1);
    expect(formerly.species[0]).toMatchObject({
      key: "GGGGG",
      matched: ["Ranunculus scelerata", "synonym"],
      note: "Formerly Ranunculus scelerata",
      groupName: "Flowering plants",
      season: null,
    });
    expect(await matched("ranunculus")).toEqual(["Ranunculus sceleratus"]);
    const other = await search({ text: "fleabane" });
    expect(other.species[0]?.note).toBe("Also called Pink fleabane");
    expect((await search({ text: "oak" })).species[0]?.note).toBeNull();
  });

  test("keeps species without a page, and drops names not in the catalogue", async () => {
    expect(await matched("pageless")).toEqual(["Pageless warbler"]);
    expect(await matched("phantom")).toEqual([]);
  });

  test("returns at most 50 species, or the limit", async () => {
    expect(await matched("e")).toHaveLength(9);
    const few = await search({ text: "e", limit: 2 });
    expect(few.species).toHaveLength(2);
  });

  test("finds places by kind: cities, states and counties, parks, areas", async () => {
    const { places, advanced, zip } = await search({ text: "oak" });
    expect(zip).toBe(false);
    expect(advanced).toBeNull();
    expect(places.map((p) => [p.kind, p.name])).toEqual([
      // Exactly the text, then starting with it, in file order.
      ["city", "Oak"],
      ["city", "Oakwood"],
      ["city", "Oak Hill"],
      ["county", "Oakwood County"],
      ["park", "Oak Hollow State Park"],
      ["watershed", "Oak Creek"],
      ["ecoregion", "Oak Plains"],
    ]);
    expect(places[1]).toEqual({
      kind: "city",
      area: "39001",
      name: "Oakwood",
      slug: null,
      state: "us-oh",
      species: null,
      type: null,
      code: null,
      counties: [
        { area: "39001", name: "Oakwood County" },
        { area: "39003", name: "Robinson Parish" },
      ],
    });
    expect(places[3]).toMatchObject({
      area: "39001",
      slug: "oakwood",
      state: "us-oh",
      species: 3,
    });
    expect(places[4]).toMatchObject({
      area: "park-oak-hollow-state-park",
      type: "state",
      species: 2,
    });
    expect(places[5]).toMatchObject({ code: "00000001", species: 1 });
  });

  test("counts a state's species with a state result", async () => {
    const { places } = await search({ text: "ohio" });
    expect(places).toEqual([
      expect.objectContaining({
        kind: "state",
        area: "us-oh",
        name: "Ohio",
        slug: "ohio",
        species: 10,
      }),
    ]);
  });

  test("names a county by its full name, else with County", async () => {
    const { places } = await search({ text: "robin" });
    expect(places.map((p) => p.name)).toEqual([
      "Robinson Parish",
      "Robin Metro Parks",
    ]);
  });

  test("limits each kind of place, counting parks with systems", async () => {
    const { places } = await search({ text: "o", limit: 1 });
    expect(places.map((p) => p.kind)).toEqual([
      "county",
      "state",
      "park",
      "watershed",
    ]);
  });

  test("matches no city on one letter", async () => {
    const { places } = await search({ text: "O" });
    expect(places.some((p) => p.kind === "city")).toBe(false);
  });

  test("never sends the text anywhere", async () => {
    const { server, release } = await open();
    await release.search({ text: "oak" });
    expect(server.requests.some((path) => path.includes("oak"))).toBe(false);
  });
});

describe("ZIP codes", () => {
  test("match nothing, read nothing and are never repeated back", async () => {
    const { server, release } = await open();
    const before = server.requests.length;
    for (const text of ["43215", " 43215 "]) {
      const result = await release.search({ text, place: "us-oh" });
      expect(result).toEqual({
        zip: true,
        species: [],
        places: [],
        advanced: null,
      });
      expect(JSON.stringify(result)).not.toContain("43215");
    }
    expect(server.requests.length).toBe(before);
  });

  test("are only five digits on their own", async () => {
    const result = await search({ text: "Oakwood 43215" });
    expect(result.zip).toBe(false);
    expect(JSON.stringify(result)).not.toContain("43215");
  });
});

// Advanced search (ODR-2026-049 as amended by ODR-2026-062), as the site's
// page lists it.
describe("Advanced", () => {
  test("lists a state's species with a season, soonest middle week first", async () => {
    const result = await search({ place: "us-oh", week: 1 });
    expect(result.species.map((s) => s.entry.common_name ?? s.key)).toEqual([
      "American robin",
      "Unsure sparrow",
      "Mourning Cloak",
      "Robin's plantain",
      "Northern red oak",
      "GGGGG",
      "Hidden lady's-slipper",
      "Oak-leaf hydrangea",
    ]);
    expect(result.places).toEqual([]);
    expect(result.advanced).toEqual({
      place: "us-oh",
      published: true,
      sort: "season",
      sorts: ["name", "season", "records", "group"],
      inSeason: 8,
      noSeason: 1,
      shown: 8,
    });
    expect(result.species[0]).toMatchObject({
      key: "EEEEE",
      area: "us-oh",
      season: [48, 2, 8],
      records: null,
      weekly: null,
      matched: null,
      note: null,
    });
  });

  test("keeps species whose season overlaps the dates", async () => {
    expect(
      await named({ place: "us-oh", from: "04-01", to: "04-14", week: 1 }),
    ).toEqual(["Unsure sparrow", "Mourning Cloak", "Robin's plantain"]);
  });

  test("runs dates over the year end", async () => {
    expect(await named({ place: "us-oh", from: "12-24", to: "01-10" })).toEqual(
      ["American robin"],
    );
  });

  test("reads 29 February as 28 February", async () => {
    expect(await named({ place: "us-oh", from: "02-29", to: "03-20" })).toEqual(
      await named({ place: "us-oh", from: "02-28", to: "03-20" }),
    );
  });

  test("searches anywhere when dates or a group come without a place", async () => {
    const result = await search({ from: "04-01", to: "04-14", text: "o" });
    expect(result.advanced?.place).toBe("anywhere");
    expect(result.species.map((s) => s.key)).toEqual(
      expect.arrayContaining(["AAAAA", "FFFFF"]),
    );
  });

  test("lists a county's species with a county result, with its records", async () => {
    const result = await search({ place: "39001", sort: "records" });
    expect(result.species.map((s) => [s.key, s.records])).toEqual([
      ["BBBBB", 90],
      ["CCCCC", 90],
      ["AAAAA", 40],
    ]);
    expect(result.species[0]).toMatchObject({
      area: "39001",
      season: [17, 20, 25],
    });
    expect(result.advanced).toMatchObject({ inSeason: 3, noSeason: 1 });
  });

  test("sorts season timing from the given week", async () => {
    expect(
      (await search({ place: "39001", week: 20 })).species.map((s) => s.key),
    ).toEqual(["BBBBB", "CCCCC", "AAAAA"]);
  });

  test("lists a park's species, never a sensitive one or one not known not to be", async () => {
    const result = await search({
      place: "park-oak-hollow-state-park",
      sort: "name",
    });
    expect(result.species.map((s) => [s.key, s.season])).toEqual([
      ["EEEEE", [47, 1, 9]],
      ["BBBBB", [16, 19, 24]],
    ]);
  });

  test("says when a place's list is not published, never that it is empty", async () => {
    for (const place of [
      "39005",
      "us-mi",
      "parks-robin-metro-parks",
      "park-oak-knoll-park",
    ]) {
      const result = await search({ place });
      expect(result.species).toEqual([]);
      expect(result.advanced).toMatchObject({ place, published: false });
    }
  });

  test("offers no Most records for Anywhere, and falls back to the default", async () => {
    const result = await search({ place: "anywhere", sort: "records" });
    expect(result.advanced).toMatchObject({
      sort: "season",
      sorts: ["name", "season", "group"],
    });
  });

  test("sorts by name, and by group then name", async () => {
    expect((await named({ place: "us-oh", sort: "name" }))[0]).toBe(
      "American robin",
    );
    expect(await named({ place: "anywhere", sort: "group" })).toEqual([
      "American robin",
      "Mourning Cloak",
      "Hidden lady's-slipper",
      "Northern red oak",
      "Oak-leaf hydrangea",
      "Ranunculus sceleratus",
      "Robin's plantain",
      "Unsure sparrow",
    ]);
  });

  test("narrows to a group, counting what is shown before the limit", async () => {
    const result = await search({
      place: "us-oh",
      group: "plants",
      week: 1,
      limit: 2,
    });
    expect(result.species.map((s) => s.key)).toEqual(["FFFFF", "BBBBB"]);
    expect(result.advanced).toMatchObject({ inSeason: 8, shown: 5 });
  });

  test("with text, keeps the species whose names contain it", async () => {
    // As the site's name box: "Mourning Cloak" contains "oak".
    expect(await named({ text: "OAK", place: "us-oh", week: 1 })).toEqual([
      "Mourning Cloak",
      "Northern red oak",
      "Oak-leaf hydrangea",
    ]);
    expect(await named({ text: "quercifolia", place: "39001" })).toEqual([
      "Oak-leaf hydrangea",
    ]);
  });
});

describe("inputs", () => {
  test("finds nothing without any", async () => {
    const { server, release } = await open();
    const before = server.requests.length;
    expect(await release.search()).toEqual({
      zip: false,
      species: [],
      places: [],
      advanced: null,
    });
    expect(await release.search({ text: "  " })).toMatchObject({
      species: [],
    });
    expect(server.requests.length).toBe(before);
  });

  test.each<[string, SearchInput]>([
    ["one date", { place: "us-oh", from: "04-01" }],
    ["a day that is not one", { from: "02-30", to: "03-01" }],
    ["a malformed day", { from: "4-1", to: "05-01" }],
    ["a month that is not one", { from: "13-01", to: "05-01" }],
    ["a sort", { place: "us-oh", sort: "random" as "name" }],
    ["a week", { place: "us-oh", week: 54 }],
    ["a limit", { text: "oak", limit: 0 }],
    ["a watershed", { place: "huc8-00000001" }],
    ["a malformed county", { place: "123456" }],
    ["a county of no state", { place: "99001" }],
    ["a malformed place", { place: "Oakwood" }],
    ["a malformed park", { place: "park-Oak Hollow" }],
  ])("rejects %s", async (_, input) => {
    await expect(search(input)).rejects.toThrow(RangeError);
  });

  test("the entry point gives the same results", async () => {
    const { release } = await open();
    expect(await searchEntry(release, { text: "oak" })).toEqual(
      await release.search({ text: "oak" }),
    );
  });
});
