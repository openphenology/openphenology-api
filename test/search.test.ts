import { describe, expect, test } from "vitest";
import { createClient, type SearchInput } from "../src/index.ts";
import { search as searchEntry } from "../src/search.ts";
import { fakeServer, wrap } from "./fixture.ts";
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
      options: {
        groups: [
          { group: "birds", name: "Birds", count: 1 },
          { group: "butterflies", name: "Butterflies and moths", count: 1 },
          { group: "plants", name: "Flowering plants", count: 5 },
          { group: null, name: "Other", count: 1 },
        ],
        stages: [
          { stage: "in-flower", label: "Reported in flower", count: 3 },
          { stage: "in-fruit", label: "Reported in fruit", count: 1 },
          { stage: "adults", label: "Reported as an adult", count: 1 },
          { stage: "larvae", label: "Reported as a larva", count: 1 },
        ],
        statuses: [
          { status: "introduced", label: "Introduced", count: 2 },
          { status: "invasive", label: "Invasive", count: 1 },
        ],
      },
    });
    const { entry, ...first } = result.species[0] ?? { entry: null };
    expect(entry?.species_key).toBe("EEEEE");
    expect(first).toEqual({
      key: "EEEEE",
      groupName: "Birds",
      area: "us-oh",
      season: [48, 2, 8],
      records: null,
      weekly: null,
      matched: null,
      note: null,
      status: null,
      stageSeason: null,
      stageLabel: null,
      seasons: null,
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

// Stage and status (ODR-2026-071), the shared filter's options
// (ODR-2026-037). test/search-site.test.ts compares them with the site's
// code on made-up releases drawn at random.
describe("stage and status", () => {
  test("keeps species reported at a stage, sorted by that stage's season", async () => {
    const result = await search({
      place: "us-oh",
      stage: "in-flower",
      week: 1,
    });
    expect(
      result.species.map((s) => [s.key, s.stageSeason, s.stageLabel]),
    ).toEqual([
      ["FFFFF", [14, 16, 19], "Reported in flower"],
      ["BBBBB", [16, 18, 20], "Reported in flower"],
      ["GGGGG", [18, 20, 23], "Reported in flower"],
    ]);
    expect(result.advanced).toMatchObject({ inSeason: 8, shown: 3 });
  });

  test("never counts a withheld stage season", async () => {
    expect(
      (await search({ place: "us-oh", stage: "in-fruit" })).species.map(
        (s) => s.key,
      ),
    ).toEqual(["FFFFF"]);
  });

  test("with dates, keeps the species whose stage season overlaps them", async () => {
    // Weeks 21 and 22: Robin's plantain is in fruit, nothing in flower.
    const dates = { place: "us-oh", from: "05-21", to: "06-03" } as const;
    expect(
      (await search({ ...dates, stage: "in-fruit" })).species.map((s) => s.key),
    ).toEqual(["FFFFF"]);
    const flower = await search({ ...dates, stage: "in-flower" });
    expect(flower.species.map((s) => s.key)).toEqual(["GGGGG"]);
    expect(flower.advanced?.options.stages).toEqual([
      { stage: "in-flower", label: "Reported in flower", count: 1 },
      { stage: "in-fruit", label: "Reported in fruit", count: 1 },
    ]);
  });

  test("says caterpillar for a butterfly's or moth's larva", async () => {
    const result = await search({
      place: "us-oh",
      group: "butterflies",
      stage: "larvae",
    });
    expect(result.species.map((s) => [s.key, s.stageLabel])).toEqual([
      ["AAAAA", "Reported as a caterpillar"],
    ]);
    // One group leaves nothing to split, but the stage options still count.
    expect(result.advanced?.options.groups).toHaveLength(4);
    expect(result.advanced?.options.stages).toContainEqual({
      stage: "larvae",
      label: "Reported as a caterpillar",
      count: 1,
    });
  });

  test("reads a county's own stage seasons", async () => {
    const result = await search({ place: "39001", stage: "in-flower" });
    expect(result.species.map((s) => [s.key, s.stageSeason])).toEqual([
      ["BBBBB", [17, 19, 21]],
    ]);
  });

  test("keeps introduced species, invasive ones among them, and never says native", async () => {
    expect(
      (
        await search({ place: "us-oh", status: "introduced", sort: "name" })
      ).species.map((s) => [s.key, s.status]),
    ).toEqual([
      ["GGGGG", "invasive"],
      ["FFFFF", "introduced"],
    ]);
    expect(
      (await search({ place: "us-oh", status: "invasive" })).species.map(
        (s) => s.key,
      ),
    ).toEqual(["GGGGG"]);
    const statuses = (await search({ place: "us-oh" })).species.map(
      (s) => s.status,
    );
    expect(new Set(statuses)).toEqual(
      new Set([null, "introduced", "invasive"]),
    );
  });

  test("gives a park's species their status but no stages", async () => {
    const result = await search({ place: "park-oak-hollow-state-park" });
    expect(result.advanced?.options.stages).toEqual([]);
    expect(
      (await search({ place: "park-oak-hollow-state-park", stage: "adults" }))
        .species,
    ).toEqual([]);
  });

  test("searches anywhere with a stage or status alone", async () => {
    const result = await search({ status: "invasive" });
    expect(result.advanced?.place).toBe("anywhere");
    expect(result.species.map((s) => s.key)).toEqual(["GGGGG"]);
  });

  test("counts each option against the other filters in force", async () => {
    const result = await search({ place: "us-oh", group: "plants", text: "r" });
    expect(result.species.map((s) => s.key)).toEqual(
      expect.arrayContaining(["BBBBB", "FFFFF", "GGGGG"]),
    );
    expect(result.advanced?.options.statuses).toEqual([
      { status: "introduced", label: "Introduced", count: 2 },
      { status: "invasive", label: "Invasive", count: 1 },
    ]);
  });
});

// Under Anywhere, a species covered in several states is listed once, with
// its season in each (owner, 2026-10-27).
describe("Anywhere with two states", () => {
  const MONARCH = {
    species_key: "MMMMM",
    scientific_name: "Danaus plexippus",
    common_name: "Monarch",
    rank: "species",
    kingdom: null,
    phylum: null,
    class: null,
    order: null,
    family: null,
    genus: null,
    group: "butterflies",
    slug: "danaus-plexippus",
    states: ["us-mi", "us-oh"],
    seasons: { "us-oh": [20, 26, 32], "us-mi": [30, 33, 36] },
    sensitive_in: [],
    introduced_in: [],
    invasive_in: [],
    stage_seasons: { "us-mi": { larva: [31, 33, 35] } },
  };
  const ROBIN = {
    ...MONARCH,
    species_key: "RRRRR",
    scientific_name: "Turdus migratorius",
    common_name: "American robin",
    group: "birds",
    slug: "turdus-migratorius",
    states: ["us-oh"],
    seasons: { "us-oh": [10, 14, 18] },
    stage_seasons: {},
  };
  const two = async (input: SearchInput) => {
    const server = await fakeServer({
      "catalogue.json": wrap("catalogue.json", "catalogue", {
        species: [MONARCH, ROBIN],
      }),
      "groups.json": searchFiles["groups.json"],
    });
    const client = createClient({ baseUrl: BASE, fetch: server.fetch });
    return (await client.release()).search(input);
  };

  test("lists Monarch once, with both states' seasons", async () => {
    const result = await two({ place: "anywhere", week: 1 });
    expect(result.species.map((s) => s.key)).toEqual(["RRRRR", "MMMMM"]);
    const monarch = result.species[1];
    // Its top-level result is the state that comes first in the sort.
    expect(monarch).toMatchObject({ area: "us-oh", season: [20, 26, 32] });
    expect(monarch?.seasons).toEqual([
      {
        state: "us-mi",
        season: [30, 33, 36],
        stageSeason: null,
        status: null,
        records: null,
        weekly: null,
      },
      {
        state: "us-oh",
        season: [20, 26, 32],
        stageSeason: null,
        status: null,
        records: null,
        weekly: null,
      },
    ]);
    expect(result.advanced).toMatchObject({ inSeason: 2, shown: 2 });
    expect(result.advanced?.options.groups).toEqual([
      { group: "birds", name: "Birds", count: 1 },
      { group: "butterflies", name: "Butterflies and moths", count: 1 },
    ]);
  });

  test("keeps Monarch when only one state's season overlaps the dates", async () => {
    // Weeks 34 and 35: Michigan's season only.
    const result = await two({ from: "08-20", to: "08-31" });
    expect(result.species.map((s) => s.key)).toEqual(["MMMMM"]);
    expect(result.species[0]).toMatchObject({
      area: "us-mi",
      season: [30, 33, 36],
    });
    expect(result.species[0]?.seasons?.map((s) => s.state)).toEqual([
      "us-mi",
      "us-oh",
    ]);
    expect(result.advanced).toMatchObject({ inSeason: 1, shown: 1 });
  });

  test("keeps Monarch at a stage reported in one state", async () => {
    const result = await two({ stage: "larvae" });
    expect(result.species.map((s) => [s.key, s.area, s.stageLabel])).toEqual([
      ["MMMMM", "us-mi", "Reported as a caterpillar"],
    ]);
    expect(result.species[0]?.seasons?.map((s) => s.stageSeason)).toEqual([
      [31, 33, 35],
      null,
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
    ["a stage", { place: "us-oh", stage: "pupae" as "adults" }],
    ["a status", { place: "us-oh", status: "native" as "invasive" }],
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
