import { describe, expect, test } from "vitest";
import { ApiError, createClient, FormatError } from "../src/index.ts";
import {
  fakeServer,
  RELEASE,
  provenance,
  releaseFiles,
  wrap,
} from "./fixture.ts";

const BASE = "https://example.test/";

describe("release", () => {
  test("current() reads current.json fresh", async () => {
    const server = await fakeServer();
    const client = createClient({ baseUrl: BASE, fetch: server.fetch });
    const current = await client.current();
    expect(current.kind).toBe("current");
    expect(current.data.release).toBe(RELEASE);
    await client.current();
    expect(
      server.requests.filter((p) => p.endsWith("current.json")).length,
    ).toBe(2);
  });

  test("reads current.json once and keeps that release", async () => {
    const server = await fakeServer();
    const client = createClient({ baseUrl: BASE, fetch: server.fetch });
    const [a, b] = await Promise.all([client.release(), client.release()]);
    expect(a.id).toBe(RELEASE);
    expect(b).toBe(a);
    expect(server.requests.filter((p) => p === "current.json")).toHaveLength(1);
  });

  test("refresh reads current.json again", async () => {
    const server = await fakeServer();
    const client = createClient({ baseUrl: BASE, fetch: server.fetch });
    const before = await client.release();
    await before.stateResult("us-zz", "EX1");
    expect(await client.release({ refresh: true })).toBe(before);

    server.tamper(
      "current.json",
      JSON.stringify({
        id: "current.json",
        kind: "current",
        format: "current/1.0",
        provenance,
        data: { release: "2026-01-12", published_at: "2026-01-12T06:00:00Z" },
      }),
    );
    expect(await client.release()).toBe(before);
    const after = await client.release({ refresh: true });
    expect(after.id).toBe("2026-01-12");
    expect(await client.release()).toBe(after);

    // The earlier release still reads its own files, from its cache.
    expect(await before.stateResult("us-zz", "EX1")).not.toBeNull();
    expect(server.requests.filter((p) => p === "current.json")).toHaveLength(3);
    expect(
      server.requests.filter((p) => p.endsWith("results/us-zz/EX1.json")),
    ).toEqual([`releases/${RELEASE}/results/us-zz/EX1.json`]);
  });

  test("refresh does nothing to a pinned release", async () => {
    const server = await fakeServer();
    const client = createClient({
      baseUrl: BASE,
      fetch: server.fetch,
      release: RELEASE,
    });
    const release = await client.release();
    expect(await client.release({ refresh: true })).toBe(release);
    expect(server.requests).toEqual([`releases/${RELEASE}/methods.json`]);
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

  test("a pinned release that is not published is an ApiError", async () => {
    const server = await fakeServer();
    server.failNext(`releases/${RELEASE}/methods.json`, 404);
    const client = createClient({
      baseUrl: BASE,
      fetch: server.fetch,
      release: RELEASE,
    });
    await expect(client.release()).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      url: `${BASE}releases/${RELEASE}/methods.json`,
      message: `Release ${RELEASE} is not available`,
    });
    // The failure is not kept: the next call tries again.
    const release = await client.release();
    expect(release.id).toBe(RELEASE);
    expect(
      server.requests.filter((p) => p.endsWith("methods.json")),
    ).toHaveLength(2);
  });

  test("a pinned release's check is reused by methods()", async () => {
    const server = await fakeServer();
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
      release: RELEASE,
    }).release();
    expect((await release.methods())?.data.method).toBe("test-1");
    expect(server.requests).toEqual([`releases/${RELEASE}/methods.json`]);
  });

  test("with verify, a pinned release is checked through its manifest", async () => {
    const server = await fakeServer();
    server.failNext(`releases/${RELEASE}/manifest.json`, 404);
    const client = createClient({
      baseUrl: BASE,
      fetch: server.fetch,
      release: RELEASE,
      verify: true,
    });
    await expect(client.release()).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: `Release ${RELEASE} is not available`,
    });
    expect(server.requests).toEqual([`releases/${RELEASE}/manifest.json`]);
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
      "Sample songbird",
    ]);
    expect((await release.groups())?.data.groups[0]?.group).toBe("birds");
    expect((await release.notes())?.data.results.added).toBe(2);
    expect((await release.methods())?.data.method).toBe("test-1");
    expect((await release.sources())?.data.sources[0]?.source).toBe("example");
    expect((await client.releases()).data.releases[0]?.status).toBe("current");
    expect((await client.terms()).data.licence).toBe("CC-BY-NC-4.0");
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
      { area: "99001", state: null, share: 0.75 },
      { area: "99002", state: null, share: 0.25 },
    ]);
    expect(await release.zipCounties("99999")).toEqual([]);
    expect(await release.zipCounties("12345")).toEqual([]);
    await expect(release.zipCounties("9990")).rejects.toThrow(RangeError);
    expect(
      Object.keys((await release.postal("999"))?.data.zips ?? {}),
    ).toContain("99901");
    expect(await release.postal("123")).toBeNull();
    expect(
      (await release.cities("us-zz"))?.data.cities.map((c) => c.name),
    ).toEqual(["Exampleton", "Sample"]);
    expect(() => release.cities("ohio")).toThrow(RangeError);
    expect(() => release.postal("99")).toThrow(RangeError);
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
    const server = await fakeServer();
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
      release: RELEASE,
    }).release();
    expect(() => release.countyResult("us-zz", "../x", "EX1")).toThrow(
      RangeError,
    );
    expect(() => release.stateResult("US-ZZ", "EX1")).toThrow(RangeError);
    expect(() => release.stateResult("us-zz", "a/b")).toThrow(RangeError);
  });
});

describe("shards", () => {
  const at = (path: string) => `releases/${RELEASE}/${path}`;
  const shard = (path: string, kind: string, data: unknown) =>
    JSON.stringify(wrap(path, kind, data));

  test("joins a split file's lists in shard order", async () => {
    const server = await fakeServer();
    const area = { area: "us-zz", species_key: "EX9", gbif_download_dois: [] };
    const dataset = (key: string) => ({
      dataset_key: key,
      title: null,
      publisher: null,
      citation: null,
      url: null,
      records: 1,
    });
    for (const [n, key, link] of [
      [0, "d1", "https://example.test/1"],
      [1, "d2", "https://example.test/2"],
    ] as const) {
      const path = `attribution/us-zz/EX9/${String(n)}.json`;
      server.tamper(
        at(path),
        shard(path, "attribution", {
          ...area,
          datasets: [dataset(key)],
          record_links: [link],
        }),
      );
    }
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
    }).release();
    const file = await release.attribution("us-zz", "EX9");
    expect(file?.data.datasets.map((d) => d.dataset_key)).toEqual(["d1", "d2"]);
    expect(file?.data.record_links).toEqual([
      "https://example.test/1",
      "https://example.test/2",
    ]);
    expect(file?.data.area).toBe("us-zz");
    expect(server.requests.filter((p) => p.includes("EX9"))).toEqual([
      at("attribution/us-zz/EX9.json"),
      at("attribution/us-zz/EX9/0.json"),
      at("attribution/us-zz/EX9/1.json"),
      at("attribution/us-zz/EX9/2.json"),
    ]);
  });

  test("merges a split file's maps and keeps a list that is null", async () => {
    const server = await fakeServer();
    server.failNext(at("slugs.json"), 404);
    for (const [n, slug, key] of [
      [0, "first", "EX1"],
      [1, "second", "EX2"],
    ] as const) {
      const path = `slugs/${String(n)}.json`;
      server.tamper(
        at(path),
        shard(path, "slugs", { species: { [slug]: key }, redirects: {} }),
      );
    }
    const path = "attribution/us-zz/EX8/0.json";
    server.tamper(
      at(path),
      shard(path, "attribution", {
        area: "us-zz",
        species_key: "EX8",
        datasets: [],
        gbif_download_dois: [],
        record_links: null,
      }),
    );
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
    }).release();
    expect(await release.speciesBySlug("second")).toBe("EX2");
    expect(await release.speciesBySlug("first")).toBe("EX1");
    expect(
      (await release.attribution("us-zz", "EX8"))?.data.record_links,
    ).toBeNull();
  });

  test("reads releases.json from its shards", async () => {
    const server = await fakeServer();
    server.failNext("releases.json", 404);
    const entry = (release: string) => ({
      release,
      status: "available",
      published_at: `${release}T06:00:00Z`,
      doi: null,
      builds_on: null,
      reason: null,
    });
    for (const [n, release] of [
      [0, "2026-01-05"],
      [1, "2026-01-12"],
    ] as const) {
      server.tamper(
        `releases/${String(n)}.json`,
        JSON.stringify({
          id: `releases/${String(n)}.json`,
          kind: "releases",
          format: "releases/1.0",
          provenance,
          data: { releases: [entry(release)] },
        }),
      );
    }
    const file = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
    }).releases();
    expect(file.data.releases.map((r) => r.release)).toEqual([
      "2026-01-05",
      "2026-01-12",
    ]);
  });

  test("a missing releases.json with no shards is an ApiError", async () => {
    const server = await fakeServer();
    server.failNext("releases.json", 404);
    await expect(
      createClient({ baseUrl: BASE, fetch: server.fetch }).releases(),
    ).rejects.toMatchObject({ name: "ApiError", status: 404 });
  });

  test("a kind that is never split is not looked for in shards", async () => {
    const server = await fakeServer();
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
    }).release();
    expect(await release.stateResult("us-zz", "NOPE")).toBeNull();
    expect(server.requests.filter((p) => p.includes("NOPE"))).toEqual([
      at("results/us-zz/NOPE.json"),
    ]);
  });

  test("with verify, only shards the manifest lists are requested", async () => {
    const server = await fakeServer();
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
      verify: true,
    }).release();
    expect((await release.catalogue()).map((s) => s.species_key)).toEqual([
      "EX1",
      "EX2",
    ]);
    expect(server.requests.filter((p) => p.includes("catalogue"))).toEqual([
      at("catalogue/0.json"),
      at("catalogue/1.json"),
    ]);
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

describe("manifest parts", () => {
  const MANIFEST = `releases/${RELEASE}/manifest.json`;

  /** Splits the served manifest into `parts` parts, as manifest/2.0 allows. */
  async function split(parts: number) {
    const server = await fakeServer();
    const manifest = JSON.parse(server.files.get(MANIFEST) ?? "") as {
      data: { files: { path: string }[] };
    };
    const files = manifest.data.files;
    const size = Math.ceil(files.length / parts);
    for (let n = 0; n < parts; n++) {
      const path = n === 0 ? "manifest.json" : `manifest/${String(n)}.json`;
      server.tamper(
        `releases/${RELEASE}/${path}`,
        JSON.stringify({
          ...manifest,
          id: `releases/${RELEASE}/${path}`,
          data: {
            ...manifest.data,
            parts,
            files: files.slice(n * size, (n + 1) * size),
          },
        }),
      );
    }
    return { server, files };
  }

  test("joins every part's files", async () => {
    const { server, files } = await split(3);
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
    }).release();
    const manifest = await release.manifest();
    expect(manifest.data.parts).toBe(3);
    expect(manifest.data.files.map((f) => f.path)).toEqual(
      files.map((f) => f.path),
    );
    await release.manifest();
    expect(server.requests.filter((p) => p.includes("/manifest")).length).toBe(
      3,
    );
  });

  test("verifies a file listed in a later part", async () => {
    const { server, files } = await split(3);
    const last = files.at(-2)?.path ?? "";
    expect(last).not.toBe("");
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
      verify: true,
    }).release();
    expect(await release.stateResult("us-zz", "EX1")).not.toBeNull();
    expect(
      (await release.manifest()).data.files.some((f) => f.path === last),
    ).toBe(true);
  });

  test("a missing part is a FormatError", async () => {
    const { server } = await split(2);
    server.failNext(`releases/${RELEASE}/manifest/1.json`, 404);
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
    }).release();
    await expect(release.manifest()).rejects.toMatchObject({
      name: "FormatError",
      code: "malformed",
      path: "manifest/1.json",
    });
  });

  test("reads a manifest/1.0, which has no parts", async () => {
    const server = await fakeServer();
    const manifest = JSON.parse(server.files.get(MANIFEST) ?? "") as {
      data: Record<string, unknown>;
    };
    const data = { ...manifest.data };
    delete data.parts;
    server.tamper(
      MANIFEST,
      JSON.stringify({ ...manifest, format: "manifest/1.0", data }),
    );
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
    }).release();
    const read = await release.manifest();
    expect(read.data.parts).toBeUndefined();
    expect(read.data.files.length).toBeGreaterThan(0);
  });

  test("refuses a manifest/3.0", async () => {
    const server = await fakeServer();
    const manifest = JSON.parse(server.files.get(MANIFEST) ?? "") as object;
    server.tamper(
      MANIFEST,
      JSON.stringify({ ...manifest, format: "manifest/3.0" }),
    );
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
    }).release();
    await expect(release.manifest()).rejects.toMatchObject({
      code: "unsupported-version",
    });
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

describe("weekly lists in Backyard and region files", () => {
  interface Data {
    effort: number[];
    species: [{ labels: string }];
    areas: [{ effort: number[] }];
  }
  const cases: [string, string, (data: Data) => void, RegExp][] = [
    [
      "Backyard effort for 52 weeks",
      "backyard/us-zz/99001.json",
      (d) => {
        d.effort.pop();
      },
      /effort must be 53 numbers/,
    ],
    [
      "Backyard labels for 52 weeks",
      "backyard/us-zz/99001.json",
      (d) => {
        d.species[0].labels = "n".repeat(52);
      },
      /species\[0\]\.labels must be 53 Backyard labels/,
    ],
    [
      "an unknown Backyard label",
      "backyard/us-zz/99001.json",
      (d) => {
        d.species[0].labels = `x${"n".repeat(52)}`;
      },
      /species\[0\]\.labels must be 53 Backyard labels/,
    ],
    [
      "region effort for 52 weeks",
      "regions/us-zz.json",
      (d) => {
        d.areas[0].effort.pop();
      },
      /areas\[0\]\.effort must be 53 numbers/,
    ],
  ];

  test.each(cases)("rejects %s", async (_, path, change, message) => {
    const server = await fakeServer();
    const file = structuredClone(releaseFiles[path]) as { data: Data };
    change(file.data);
    server.tamper(`releases/${RELEASE}/${path}`, JSON.stringify(file));
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
    }).release();
    const read = path.startsWith("backyard")
      ? release.backyard("us-zz", "99001")
      : release.region("us-zz");
    await expect(read).rejects.toThrow(message);
    await expect(read).rejects.toBeInstanceOf(FormatError);
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

  test("a release without a manifest is not available", async () => {
    const server = await fakeServer();
    server.failNext(`releases/${RELEASE}/manifest.json`, 404);
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
    }).release();
    await expect(release.manifest()).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: `Release ${RELEASE} is not available`,
    });
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
