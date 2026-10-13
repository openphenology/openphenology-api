import { describe, expect, test } from "vitest";
import { ApiError, createClient, FormatError } from "../src/index.ts";
import { fakeServer, RELEASE } from "./fixture.ts";

const BASE = "https://example.test/";

describe("release", () => {
  test("reads current.json once and keeps that release", async () => {
    const server = await fakeServer();
    const client = createClient({ baseUrl: BASE, fetch: server.fetch });
    const [a, b] = await Promise.all([client.release(), client.release()]);
    expect(a.id).toBe(RELEASE);
    expect(b).toBe(a);
    expect(server.requests.filter((p) => p === "current.json")).toHaveLength(1);
  });

  test("a pinned release skips current.json", async () => {
    const server = await fakeServer();
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
      release: RELEASE,
    }).release();
    expect(release.id).toBe(RELEASE);
    expect(server.requests).not.toContain("current.json");
  });

  test("rejects a malformed pinned release", async () => {
    await expect(createClient({ release: "../x" }).release()).rejects.toThrow(
      RangeError,
    );
  });
});

describe("files", () => {
  test("reads results, regions and every catalogue shard", async () => {
    const server = await fakeServer();
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
    }).release();
    const county = await release.countyResult("us-zz", "99001", "EX1");
    expect(county?.kind).toBe("county-weekly");
    expect(county?.data.season).toEqual([14, 22, 35]);
    expect(county?.data.thresholds).toEqual({ records: 20, years: 5 });
    expect((await release.stateResult("us-zz", "EX1"))?.data.area).toBe(
      "us-zz",
    );
    expect((await release.region("us-zz"))?.data.areas[0]?.area).toBe("99001");
    expect((await release.catalogue()).map((s) => s.species_key)).toEqual([
      "EX1",
      "EX2",
    ]);
  });

  test("reads a species, by key or by slug", async () => {
    const server = await fakeServer();
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
    }).release();
    expect((await release.species("EX1"))?.data.areas[0]?.season).toEqual([
      14, 22, 35,
    ]);
    expect(await release.species("NOPE")).toBeNull();
    expect(await release.speciesBySlug("exemplum-primum")).toBe("EX1");
    expect(await release.speciesBySlug("old-name")).toBe("EX1");
    expect(await release.speciesBySlug("unknown")).toBeNull();
  });

  test("reads names, groups and the files about the release", async () => {
    const server = await fakeServer();
    const client = createClient({ baseUrl: BASE, fetch: server.fetch });
    const release = await client.release();
    expect((await release.searchNames()).map(([name]) => name)).toEqual([
      "Exemplum primum",
      "Example bird",
    ]);
    expect((await release.groups())?.data.groups[0]?.group).toBe("birds");
    expect((await release.notes())?.data.results.added).toBe(2);
    expect((await release.methods())?.data.method).toBe("test-1");
    expect((await release.sources())?.data.sources[0]?.source).toBe("example");
    expect((await client.releases()).data.releases[0]?.status).toBe("current");
    expect((await client.terms()).data.licence).toBe("CC-BY-4.0");
  });

  test("reads attribution and Backyard labels", async () => {
    const server = await fakeServer();
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
    }).release();
    const attribution = await release.attribution("us-zz", "EX1");
    expect(attribution?.data.datasets[0]?.records).toBe(120);
    expect(attribution?.data.record_links).toBeNull();
    expect(await release.attribution("us-zz", "EX1", "99001")).toBeNull();
    expect(
      server.requests.some((p) =>
        p.endsWith("attribution/us-zz/99001/EX1.json"),
      ),
    ).toBe(true);
    const backyard = await release.backyard("us-zz", "99001");
    expect(backyard?.data.species[0]?.labels).toHaveLength(53);
  });

  test("reads map outlines and ZIP code counties", async () => {
    const server = await fakeServer();
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
    }).release();
    expect(
      (await release.boundaries("us-zz"))?.data.features[0]?.properties.area,
    ).toBe("99001");
    expect(await release.zipCounties("99901")).toEqual([
      { area: "99001", share: 0.75 },
      { area: "99002", share: 0.25 },
    ]);
    expect(await release.zipCounties("99999")).toEqual([]);
    expect(await release.zipCounties("12345")).toEqual([]);
    await expect(release.zipCounties("9990")).rejects.toThrow(RangeError);
  });

  test("a result that is not published is null", async () => {
    const server = await fakeServer();
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
    }).release();
    expect(await release.countyResult("us-zz", "99001", "NOPE")).toBeNull();
  });

  test("fetches each release file once", async () => {
    const server = await fakeServer();
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
    }).release();
    await Promise.all([
      release.stateResult("us-zz", "EX1"),
      release.stateResult("us-zz", "EX1"),
    ]);
    await release.stateResult("us-zz", "EX1");
    expect(
      server.requests.filter((p) => p.endsWith("us-zz/EX1.json")),
    ).toHaveLength(1);
  });

  test("rejects codes that could change the path", async () => {
    const release = await createClient({
      baseUrl: BASE,
      release: RELEASE,
    }).release();
    expect(() => release.countyResult("us-zz", "../x", "EX1")).toThrow(
      RangeError,
    );
    expect(() => release.stateResult("US-ZZ", "EX1")).toThrow(RangeError);
    expect(() => release.stateResult("us-zz", "a/b")).toThrow(RangeError);
  });
});

describe("verification", () => {
  test("checks files against the manifest's SHA-256", async () => {
    const server = await fakeServer();
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
      verify: true,
    }).release();
    expect(await release.stateResult("us-zz", "EX1")).not.toBeNull();
  });

  test("rejects a file that does not match", async () => {
    const server = await fakeServer();
    server.tamper(`releases/${RELEASE}/results/us-zz/EX1.json`, "{}");
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
      verify: true,
    }).release();
    await expect(release.stateResult("us-zz", "EX1")).rejects.toThrow(
      /SHA-256/,
    );
  });

  test("a file the manifest does not list is not requested", async () => {
    const server = await fakeServer();
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
      verify: true,
    }).release();
    expect(await release.stateResult("us-zz", "NOPE")).toBeNull();
    expect(server.requests.some((p) => p.endsWith("NOPE.json"))).toBe(false);
  });
});

describe("errors", () => {
  test("retries a 503, then succeeds", async () => {
    const server = await fakeServer();
    server.failNext("current.json", 503);
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
    }).release();
    expect(release.id).toBe(RELEASE);
  });

  test("gives up after the retries", async () => {
    const server = await fakeServer();
    server.failNext("current.json", 500, 500);
    const client = createClient({
      baseUrl: BASE,
      fetch: server.fetch,
      retries: 1,
    });
    await expect(client.release()).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
    });
    // A failed release can be read again.
    expect((await client.release()).id).toBe(RELEASE);
  });

  test("does not retry a 403", async () => {
    const server = await fakeServer();
    server.failNext("current.json", 403);
    await expect(
      createClient({ baseUrl: BASE, fetch: server.fetch }).release(),
    ).rejects.toBeInstanceOf(ApiError);
    expect(server.requests).toHaveLength(1);
  });

  test("retries after a network error", async () => {
    const server = await fakeServer();
    let failed = false;
    const flaky = ((input: RequestInfo | URL) => {
      if (!failed) {
        failed = true;
        return Promise.reject(new TypeError("offline"));
      }
      return server.fetch(input);
    }) as typeof fetch;
    expect(
      (await createClient({ baseUrl: BASE, fetch: flaky }).release()).id,
    ).toBe(RELEASE);
  });

  test("a network error becomes an ApiError", async () => {
    const failing = (() =>
      Promise.reject(new TypeError("offline"))) as typeof fetch;
    const client = createClient({ baseUrl: BASE, fetch: failing, retries: 0 });
    await expect(client.release()).rejects.toBeInstanceOf(ApiError);
  });

  test("rejects an unsupported format version", async () => {
    const server = await fakeServer();
    server.tamper(
      "current.json",
      JSON.stringify({
        id: "current",
        kind: "current",
        format: "current/2.0",
        provenance: {},
        data: { release: RELEASE, published_at: "2026-01-05T06:00:00Z" },
      }),
    );
    await expect(
      createClient({ baseUrl: BASE, fetch: server.fetch }).release(),
    ).rejects.toBeInstanceOf(FormatError);
  });

  test("rejects a result with the wrong number of weeks", async () => {
    const server = await fakeServer();
    const bad = JSON.stringify({
      id: "x",
      kind: "state-weekly",
      format: "state-weekly/1.0",
      provenance: {},
      data: { weekly: { records: [1], years: [1] }, effort: [1] },
    });
    server.tamper(`releases/${RELEASE}/results/us-zz/EX1.json`, bad);
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
    }).release();
    await expect(release.stateResult("us-zz", "EX1")).rejects.toThrow(
      /53 numbers/,
    );
  });
});

describe("malformed files", () => {
  const cases: [string, unknown][] = [
    ["not an object", [1]],
    [
      "wrong kind",
      {
        id: "x",
        kind: "region",
        format: "current/1.0",
        provenance: {},
        data: {},
      },
    ],
    [
      "no id",
      { kind: "current", format: "current/1.0", provenance: {}, data: {} },
    ],
    [
      "no provenance",
      { id: "x", kind: "current", format: "current/1.0", data: {} },
    ],
    [
      "no data",
      { id: "x", kind: "current", format: "current/1.0", provenance: {} },
    ],
    ["no format", { id: "x", kind: "current", provenance: {}, data: {} }],
  ];
  test.each(cases)("rejects current.json with %s", async (_, value) => {
    const server = await fakeServer();
    server.tamper("current.json", JSON.stringify(value));
    await expect(
      createClient({ baseUrl: BASE, fetch: server.fetch }).release(),
    ).rejects.toBeInstanceOf(FormatError);
  });

  test("rejects a file that is not JSON", async () => {
    const server = await fakeServer();
    server.tamper("current.json", "not json");
    await expect(
      createClient({ baseUrl: BASE, fetch: server.fetch }).release(),
    ).rejects.toThrow(/not valid JSON/);
  });

  test("a release without a manifest is an error", async () => {
    const server = await fakeServer();
    server.tamper(`releases/${RELEASE}/manifest.json`, "");
    server.failNext(`releases/${RELEASE}/manifest.json`, 404);
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
    }).release();
    await expect(release.manifest()).rejects.toThrow(/no manifest/);
  });

  test("a missing current.json is an ApiError", async () => {
    const server = await fakeServer();
    server.failNext("current.json", 404);
    await expect(
      createClient({ baseUrl: BASE, fetch: server.fetch }).release(),
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("cancelling", () => {
  test("an aborted signal stops without retrying", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const failing = ((_: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      return Promise.reject(init?.signal?.reason as Error);
    }) as typeof fetch;
    const client = createClient({
      baseUrl: BASE,
      fetch: failing,
      signal: controller.signal,
    });
    await expect(client.release()).rejects.toBeInstanceOf(ApiError);
    expect(calls).toBe(1);
  });

  test("a base URL without a trailing slash still works", async () => {
    const server = await fakeServer();
    const release = await createClient({
      baseUrl: "https://example.test",
      fetch: server.fetch,
    }).release();
    expect(release.id).toBe(RELEASE);
  });
});
