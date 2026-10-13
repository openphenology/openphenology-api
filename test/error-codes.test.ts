import { describe, expect, test } from "vitest";
import { createClient } from "../src/index.ts";
import { fakeServer, RELEASE } from "./fixture.ts";

const BASE = "https://example.test/";

describe("ApiError codes", () => {
  test("network: the request could not be sent", async () => {
    const client = createClient({
      baseUrl: BASE,
      retries: 0,
      fetch: () => Promise.reject(new TypeError("offline")),
    });
    await expect(client.release()).rejects.toMatchObject({ code: "network" });
  });

  test("timeout: an attempt ran past timeoutMs", async () => {
    const client = createClient({
      baseUrl: BASE,
      retries: 0,
      timeoutMs: 5,
      fetch: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason as Error);
          });
        }),
    });
    await expect(client.release()).rejects.toMatchObject({ code: "timeout" });
  });

  test("aborted: the client's signal cancelled it", async () => {
    const controller = new AbortController();
    controller.abort();
    const server = await fakeServer();
    const client = createClient({
      baseUrl: BASE,
      signal: controller.signal,
      fetch: (input, init) =>
        init?.signal?.aborted === true
          ? Promise.reject(new DOMException("aborted", "AbortError"))
          : server.fetch(input),
    });
    await expect(client.release()).rejects.toMatchObject({ code: "aborted" });
  });

  test("status: an unexpected HTTP status", async () => {
    const server = await fakeServer();
    server.failNext("current.json", 403);
    const client = createClient({ baseUrl: BASE, fetch: server.fetch });
    await expect(client.release()).rejects.toMatchObject({
      code: "status",
      status: 403,
    });
  });

  test("not-found: a required file is missing", async () => {
    const server = await fakeServer();
    server.failNext("terms.json", 404);
    const client = createClient({ baseUrl: BASE, fetch: server.fetch });
    await expect(client.terms()).rejects.toMatchObject({
      code: "not-found",
      status: 404,
    });
  });

  test("release-unavailable: a pinned release is not published", async () => {
    const server = await fakeServer();
    const client = createClient({
      baseUrl: BASE,
      fetch: server.fetch,
      release: "2020-01-01",
    });
    await expect(client.release()).rejects.toMatchObject({
      code: "release-unavailable",
      status: 404,
    });
  });
});

describe("FormatError codes", () => {
  const current = (body: unknown) => JSON.stringify(body);
  const wrapper = {
    id: "current.json",
    kind: "current",
    format: "current/1.0",
    provenance: {},
    data: {},
  };
  test.each([
    ["not-json", "not json"],
    ["wrong-kind", current({ ...wrapper, kind: "terms" })],
    ["unsupported-version", current({ ...wrapper, format: "current/2.0" })],
    ["malformed", current({ ...wrapper, data: undefined })],
  ])("%s", async (code, body) => {
    const server = await fakeServer();
    server.tamper("current.json", body);
    const client = createClient({ baseUrl: BASE, fetch: server.fetch });
    await expect(client.release()).rejects.toMatchObject({
      name: "FormatError",
      code,
    });
  });

  test("checksum: a file does not match the manifest", async () => {
    const server = await fakeServer();
    server.tamper(`releases/${RELEASE}/results/us-zz/EX1.json`, "{}");
    const release = await createClient({
      baseUrl: BASE,
      fetch: server.fetch,
      verify: true,
    }).release();
    await expect(release.stateResult("us-zz", "EX1")).rejects.toMatchObject({
      code: "checksum",
    });
  });
});
