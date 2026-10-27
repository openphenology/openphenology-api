import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createClient } from "@openphenology/api";
import { describe, expect, test } from "vitest";
import { createServer, describeWeek, SERVER_INFO } from "../src/index.ts";
import {
  fakeServer,
  RELEASE,
  releaseFiles,
  wrap,
} from "../../../test/fixture.ts";
import { searchFiles } from "../../../test/search-fixture.ts";

const BASE = "https://example.test/";
const LIMITS =
  "These results show when people recorded a species, not when or where it occurs.";
const TERMS = {
  licence: "CC-BY-NC-4.0",
  licence_url: "https://creativecommons.org/licenses/by-nc/4.0/",
  cite: "Made up.",
  credit: "Made up.",
};

/** Connects an MCP client to a server reading the made-up release. */
async function connect(
  now = new Date("2026-04-08T12:00:00Z"),
  zip: "full" | "prefix" = "full",
  files: Record<string, unknown> = releaseFiles,
) {
  const data = await fakeServer(files);
  const server = createServer({
    client: createClient({ baseUrl: BASE, fetch: data.fetch }),
    now: () => now,
    zip,
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientSide);
  /** Calls a tool and parses its answer. */
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const [content] = result.content as { type: string; text: string }[];
    return {
      isError: result.isError === true,
      text: content?.text ?? "",
      answer: () =>
        JSON.parse(content?.text ?? "null") as Record<string, unknown>,
    };
  };
  return { client, call, ...data };
}

test("an assistant can connect and read the server's name and instructions", async () => {
  const { client } = await connect();
  expect(client.getServerVersion()).toMatchObject(SERVER_INFO);
  expect(client.getInstructions()).toContain("limits");
});

test("reports its package version", async () => {
  const { readFile } = await import("node:fs/promises");
  const pkg = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  expect(SERVER_INFO.version).toBe(pkg.version);
});

test("lists the six tools, each read-only", async () => {
  const { client } = await connect();
  const { tools } = await client.listTools();
  expect(tools.map((tool) => tool.name).sort()).toEqual([
    "find_county",
    "get_records",
    "get_season",
    "get_terms",
    "search",
    "this_week",
  ]);
  for (const tool of tools) expect(tool.annotations?.readOnlyHint).toBe(true);
});

describe("every answer", () => {
  test.each([
    ["search", { text: "example" }],
    ["find_county", { zip: "99901" }],
    ["get_season", { species_key: "EX1", state: "us-zz" }],
    ["get_records", { species_key: "EX1", state: "us-zz" }],
    ["this_week", { county: "99001", state: "us-zz" }],
    ["get_terms", {}],
  ])("%s carries the release, limits and terms", async (name, args) => {
    const { call } = await connect();
    const answer = (await call(name, args)).answer();
    expect(answer.release).toBe(RELEASE);
    expect(typeof answer.limits).toBe("string");
    expect(answer.terms).toEqual(TERMS);
  });
});

describe("search", () => {
  test("finds a species by part of any name, with its names", async () => {
    const { call } = await connect();
    const answer = (await call("search", { text: "Songbird" })).answer();
    expect(answer.species).toEqual([
      {
        species_key: "EX1",
        scientific_name: "Exemplum primum",
        common_name: null,
        group: "Birds",
        matched: { name: "Sample songbird", kind: "other-name" },
      },
    ]);
    expect(answer).not.toHaveProperty("query");
    expect(JSON.stringify(answer)).not.toContain("Songbird");
  });

  test("lists a species once, by its best match", async () => {
    const { call } = await connect();
    const answer = (await call("search", { text: "example bird" })).answer();
    expect(answer.species).toMatchObject([
      { species_key: "EX1", matched: { name: "Example bird", kind: "common" } },
    ]);
  });

  test("answers an unknown name with no species", async () => {
    const { call } = await connect();
    const answer = (await call("search", { text: "unicorn" })).answer();
    expect(answer.species).toEqual([]);
    expect(answer.places).toEqual([]);
  });

  test("finds places by name, with their codes", async () => {
    const { call } = await connect(undefined, "full", searchFiles);
    const answer = (await call("search", { text: "oakwood" })).answer();
    expect(answer.places).toEqual([
      {
        kind: "city",
        code: "39001",
        name: "Oakwood",
        state: "us-oh",
        species_with_result: null,
        counties: [
          { area: "39001", name: "Oakwood County" },
          { area: "39003", name: "Robinson Parish" },
        ],
      },
      {
        kind: "county",
        code: "39001",
        name: "Oakwood County",
        state: "us-oh",
        species_with_result: 3,
      },
    ]);
  });

  test("lists a place's species in season between two dates", async () => {
    const { call } = await connect(undefined, "full", searchFiles);
    const answer = (
      await call("search", {
        place: "us-oh",
        from: "04-01",
        to: "04-14",
        sort: "name",
      })
    ).answer();
    expect(answer).toMatchObject({
      place: "us-oh",
      published: true,
      sort: "name",
      species_in_season: 3,
      species_without_season: 1,
      species_shown: 3,
    });
    expect(answer.species).toMatchObject([
      {
        species_key: "AAAAA",
        common_name: "Mourning Cloak",
        group: "Butterflies and moths",
        area: "us-oh",
        records: null,
        season: { middle: { week: 14, starts: "2 April" } },
      },
      { species_key: "FFFFF" },
      { species_key: "JJJJJ", group: "Other" },
    ]);
  });

  test("sorts season timing from this week", async () => {
    const { call } = await connect(
      new Date("2026-05-14T12:00:00Z"),
      "full",
      searchFiles,
    );
    const answer = (await call("search", { place: "39001" })).answer();
    expect(answer.species).toMatchObject([
      { species_key: "BBBBB", records: 90 },
      { species_key: "CCCCC" },
      { species_key: "AAAAA" },
    ]);
  });

  test("says when a place's list is not published", async () => {
    const { call } = await connect(undefined, "full", searchFiles);
    const answer = (await call("search", { place: "39005" })).answer();
    expect(answer).toMatchObject({ published: false, species: [] });
    expect(answer.note).toContain("not published");
  });

  test("matches nothing for a ZIP code and never repeats it", async () => {
    const { call, requests } = await connect(undefined, "full", searchFiles);
    const answer = (await call("search", { text: "43215" })).answer();
    expect(answer).toMatchObject({ species: [], places: [] });
    expect(answer.note).toContain("find_county");
    expect(JSON.stringify(answer)).not.toContain("43215");
    expect(requests.some((path) => path.startsWith("postal"))).toBe(false);
  });

  test("rejects one date alone", async () => {
    const { call } = await connect(undefined, "full", searchFiles);
    const result = await call("search", { place: "us-oh", from: "04-01" });
    expect(result.isError).toBe(true);
  });

  test("takes only search's inputs", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "search");
    expect(Object.keys(tool?.inputSchema.properties ?? {}).sort()).toEqual([
      "from",
      "group",
      "place",
      "sort",
      "text",
      "to",
    ]);
  });
});

describe("find_county", () => {
  test("gives a ZIP code's counties, largest share first", async () => {
    const { call } = await connect();
    const answer = (await call("find_county", { zip: "99901" })).answer();
    // The made-up counties have no real Census state, so no name is read.
    expect(answer.counties).toEqual([
      { county: "99001", state: null, name: null, share: 0.75 },
      { county: "99002", state: null, name: null, share: 0.25 },
    ]);
  });

  test("finds a county's state from its Census code", async () => {
    // 39049 is Franklin County, Ohio. The made-up release has no Ohio
    // region file, so the county has no name.
    const path = "postal/us/999.json";
    const { call, tamper } = await connect();
    tamper(
      `releases/${RELEASE}/${path}`,
      JSON.stringify(
        wrap(path, "postal", { zips: { "99901": [["39049", 1]] } }),
      ),
    );
    const answer = (await call("find_county", { zip: "99901" })).answer();
    expect(answer.counties).toEqual([
      { county: "39049", state: "us-oh", name: null, share: 1 },
    ]);
  });

  test("rejects a malformed ZIP code without reading a postal file", async () => {
    const { call, requests } = await connect();
    const result = await call("find_county", { zip: "4321" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("ZIP");
    expect(requests.some((path) => path.includes("postal/"))).toBe(false);
  });
});

describe("find_county with only a prefix, for a hosted server", () => {
  test("lists every ZIP code under the prefix, with its counties", async () => {
    const { call, requests } = await connect(undefined, "prefix");
    const answer = (await call("find_county", { zip_prefix: "999" })).answer();
    expect(answer).toMatchObject({
      prefix: "999",
      release: RELEASE,
      zips: [
        {
          zip: "99901",
          counties: [
            { county: "99001", state: null, name: null, share: 0.75 },
            { county: "99002", state: null, name: null, share: 0.25 },
          ],
        },
      ],
    });
    expect(requests).toContain(`releases/${RELEASE}/postal/us/999.json`);
  });

  test("names counties from their states' region files", async () => {
    const path = "postal/us/999.json";
    const { call, tamper } = await connect(undefined, "prefix");
    tamper(
      `releases/${RELEASE}/${path}`,
      JSON.stringify(
        wrap(path, "postal", { zips: { "99901": [["39049", 1]] } }),
      ),
    );
    const answer = (await call("find_county", { zip_prefix: "999" })).answer();
    // The made-up release has no Ohio region file, so the name stays null.
    expect(answer.zips).toEqual([
      {
        zip: "99901",
        counties: [{ county: "39049", state: "us-oh", name: null, share: 1 }],
      },
    ]);
  });

  test("refuses a whole ZIP code", async () => {
    const { call, requests } = await connect(undefined, "prefix");
    const result = await call("find_county", { zip_prefix: "99901" });
    expect(result.isError).toBe(true);
    expect(requests.some((path) => path.includes("postal/"))).toBe(false);
  });

  test("answers an unpublished prefix with no ZIP codes", async () => {
    const { call } = await connect(undefined, "prefix");
    const answer = (await call("find_county", { zip_prefix: "123" })).answer();
    expect(answer.zips).toEqual([]);
  });
});

describe("get_records", () => {
  test("gives a sensitive species' datasets, with no links", async () => {
    const { call } = await connect();
    const answer = (
      await call("get_records", { species_key: "EX1", state: "us-zz" })
    ).answer();
    expect(answer).toMatchObject({
      species_key: "EX1",
      state: "us-zz",
      records: 120,
      datasets: [{ title: "Example dataset", records: 120 }],
      gbif_download_dois: ["10.0000/example"],
      links: null,
    });
  });

  test("gives the first links, and where the rest are", async () => {
    const path = "attribution/us-zz/EX1.json";
    const file = releaseFiles[path] as { data: object };
    const { call, tamper } = await connect();
    tamper(
      `releases/${RELEASE}/${path}`,
      JSON.stringify(
        wrap(path, "attribution", {
          ...file.data,
          records: [
            {
              link: "https://www.gbif.org/occurrence/{id}",
              ids: [5, ...Array.from({ length: 24 }, () => 1)],
            },
          ],
        }),
      ),
    );
    const answer = (
      await call("get_records", { species_key: "EX1", state: "us-zz" })
    ).answer();
    expect(answer.links).toHaveLength(20);
    expect((answer.links as string[])[1]).toBe(
      "https://www.gbif.org/occurrence/6",
    );
    expect(answer.note).toMatch(/^The first 20 of 25 links\./);
  });

  test("says when no result is published", async () => {
    const { call } = await connect();
    const answer = (
      await call("get_records", { species_key: "NONE", state: "us-zz" })
    ).answer();
    expect(answer).toMatchObject({ records: null });
  });
});

describe("get_season", () => {
  test("gives a state's season weeks, with the day each starts", async () => {
    const { call } = await connect();
    const answer = (
      await call("get_season", { species_key: "EX1", state: "us-zz" })
    ).answer();
    expect(answer).toMatchObject({
      species_key: "EX1",
      scientific_name: "Exemplum primum",
      state: "us-zz",
      county: null,
      limits: LIMITS,
      result: {
        years: 4,
        season: {
          early: { week: 14, starts: "2 April" },
          middle: { week: 22, starts: "28 May" },
          late: { week: 35, starts: "27 August" },
        },
        withheld: null,
        gbif_download_dois: ["10.0000/example"],
      },
    });
  });

  test("gives a county's season", async () => {
    const { call } = await connect();
    const answer = (
      await call("get_season", {
        species_key: "EX1",
        state: "us-zz",
        county: "99001",
      })
    ).answer();
    expect(answer).toMatchObject({ county: "99001", result: { years: 4 } });
  });

  test("says why season weeks are withheld", async () => {
    const path = "results/us-zz/EX1.json";
    const file = releaseFiles[path] as { data: object };
    const { call, tamper } = await connect();
    tamper(
      `releases/${RELEASE}/${path}`,
      JSON.stringify(
        wrap(path, "state-weekly", {
          ...file.data,
          season: [],
          season_withheld: "year-round",
        }),
      ),
    );
    const answer = (
      await call("get_season", { species_key: "EX1", state: "us-zz" })
    ).answer();
    expect(answer.result).toMatchObject({
      season: null,
      withheld: "year-round",
      why: "There is no bounded season to describe",
    });
  });

  test("says a missing result looks like no result", async () => {
    const { call } = await connect();
    const answer = (
      await call("get_season", { species_key: "EX2", state: "us-zz" })
    ).answer();
    expect(answer.result).toBeNull();
    expect(answer.note).toBe(
      "A result withheld by the data rules is not published. It looks exactly like a result that does not exist.",
    );
    // With no result of its own, the note comes from methods.json.
    expect(answer.limits).toBe("Made up.");
  });

  test("asks for the state when it can't be found from the county", async () => {
    const { call } = await connect();
    const result = await call("get_season", {
      species_key: "EX1",
      county: "99001",
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Give the state of county 99001");
  });

  test("asks for a place when given none", async () => {
    const { call } = await connect();
    const result = await call("get_season", { species_key: "EX1" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Give a state, a county, or both");
  });
});

describe("this_week", () => {
  test("leaves out species without enough evidence this week", async () => {
    // The made-up county labels every week `n`.
    const { call } = await connect();
    const answer = (
      await call("this_week", { county: "99001", state: "us-zz" })
    ).answer();
    expect(answer).toMatchObject({
      week: 14,
      starts: "2 April",
      evidence_through: "2025-12-31",
      published: true,
      labels: [],
    });
  });

  test("lists species under each label, filtered by group", async () => {
    const path = "nearby/us-zz/99001.json";
    const file = releaseFiles[path] as { data: { species: object[] } };
    const [species] = file.data.species as Record<string, unknown>[];
    // Commonly reported in week 14 only.
    const labels = "n".repeat(13) + "c" + "n".repeat(39);
    const { call, tamper } = await connect();
    tamper(
      `releases/${RELEASE}/${path}`,
      JSON.stringify(
        wrap(path, "nearby", {
          ...file.data,
          species: [
            { ...species, labels },
            { ...species, species_key: "EX2", group: "plants", labels },
          ],
        }),
      ),
    );
    const answer = (
      await call("this_week", {
        county: "99001",
        state: "us-zz",
        group: "birds",
      })
    ).answer();
    expect(answer.labels).toEqual([
      {
        label: "c",
        means: expect.any(String) as unknown,
        species: [
          {
            species_key: "EX1",
            scientific_name: "Exemplum primum",
            common_name: "Example bird",
            group: "birds",
          },
        ],
      },
    ]);
  });

  test("shows a range label with its source and seasons", async () => {
    const path = "nearby/us-zz/99001.json";
    const file = releaseFiles[path] as { data: { species: object[] } };
    const [species] = file.data.species as Record<string, unknown>[];
    const range = { source: "example-range", seasons: ["year-round"] };
    const { call, tamper } = await connect();
    tamper(
      `releases/${RELEASE}/${path}`,
      JSON.stringify(
        wrap(path, "nearby", {
          ...file.data,
          species: [{ ...species, labels: "m".repeat(53), range }],
        }),
      ),
    );
    const answer = (
      await call("this_week", { county: "99001", state: "us-zz" })
    ).answer();
    expect(answer.labels).toMatchObject([
      {
        label: "m",
        means: "Within its mapped range",
        species: [{ species_key: "EX1", range }],
      },
    ]);
  });

  test("reads the week of a given date", async () => {
    const { call } = await connect();
    const answer = (
      await call("this_week", {
        county: "99001",
        state: "us-zz",
        date: "2026-01-03",
      })
    ).answer();
    expect(answer).toMatchObject({ week: 1, starts: "1 January" });
  });

  test("says when a county has no labels", async () => {
    const { call } = await connect();
    const answer = (
      await call("this_week", { county: "99002", state: "us-zz" })
    ).answer();
    expect(answer).toMatchObject({ published: false, labels: [] });
  });

  test("finds the state from the county's Census code", async () => {
    const { call } = await connect();
    const answer = (await call("this_week", { county: "39049" })).answer();
    expect(answer).toMatchObject({ state: "us-oh", published: false });
  });

  test("asks for the state when it can't be found from the county", async () => {
    const { call } = await connect();
    const result = await call("this_week", { county: "99001" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Give the state of county 99001");
  });

  test("rejects a date that does not exist", async () => {
    const { call } = await connect();
    const result = await call("this_week", {
      county: "99001",
      state: "us-zz",
      date: "2026-13-45",
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Invalid date");
  });

  test("rejects a malformed date", async () => {
    const { call } = await connect();
    const result = await call("this_week", {
      county: "99001",
      state: "us-zz",
      date: "April 8",
    });
    expect(result.isError).toBe(true);
  });
});

test("get_terms gives the terms word for word", async () => {
  const { call } = await connect();
  const answer = (await call("get_terms")).answer();
  expect(answer).toMatchObject({
    scope: "Made up.",
    warranty: "Made up.",
    contact: "nobody@example.test",
  });
});

test("reads current.json at most hourly, and terms once per release", async () => {
  let now = new Date("2026-04-08T12:00:00Z");
  const data = await fakeServer();
  const server = createServer({
    client: createClient({ baseUrl: BASE, fetch: data.fetch }),
    now: () => now,
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientSide);
  const count = (path: string) =>
    data.requests.filter((request) => request === path).length;
  await client.callTool({ name: "get_terms", arguments: {} });
  await client.callTool({ name: "search", arguments: { text: "ex" } });
  expect(count("current.json")).toBe(1);
  // get_terms reads the full terms; every other answer reuses them.
  expect(count("terms.json")).toBe(2);
  now = new Date("2026-04-08T13:00:00Z");
  await client.callTool({ name: "search", arguments: { text: "ex" } });
  expect(count("current.json")).toBe(2);
});

test("reads terms.json again after a failed read", async () => {
  const { call, failNext } = await connect();
  failNext("terms.json", 404);
  expect((await call("search", { text: "ex" })).isError).toBe(true);
  expect((await call("search", { text: "ex" })).answer().terms).toEqual(TERMS);
});

test("describeWeek counts weeks from 1 January", () => {
  expect(describeWeek(1)).toEqual({ week: 1, starts: "1 January" });
  expect(describeWeek(53)).toEqual({ week: 53, starts: "31 December" });
});
