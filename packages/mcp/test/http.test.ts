import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { expect, test } from "vitest";
import { handle, MCP_PATH, type Env, type RateLimit } from "../src/http.ts";
import { fakeServer, RELEASE } from "../../../test/fixture.ts";

const HOST = "https://api-staging.example.test";

/** Bindings whose API Worker serves the made-up release. */
async function bindings(limiter?: RateLimit) {
  const data = await fakeServer();
  // Each test gets its own address, so it gets its own client and caches.
  const env: Env = {
    API: { fetch: data.fetch },
    API_BASE_URL: `https://example.test/${crypto.randomUUID()}/`,
    ...(limiter ? { RATE_LIMITER: limiter } : {}),
  };
  return { env, data };
}

/** The made-up release's files, served under a test's own address. */
function underPrefix(env: Env, serve: typeof fetch): typeof fetch {
  const prefix = new URL(env.API_BASE_URL).pathname;
  return (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    url.pathname = "/" + url.pathname.slice(prefix.length);
    return serve(url, init);
  };
}

/** Connects an MCP client to the Worker over HTTP. */
async function connect(env: Env) {
  const transport = new StreamableHTTPClientTransport(
    new URL(`${HOST}${MCP_PATH}`),
    {
      fetch: (input, init) => handle(new Request(input, init), env),
    },
  );
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(transport);
  return client;
}

test("serves the tools over HTTP, reading through the API binding", async () => {
  const { env, data } = await bindings();
  const api = env.API;
  if (!api) throw new Error("no API binding");
  const served = { ...env, API: { fetch: underPrefix(env, api.fetch) } };
  const client = await connect(served);
  const { tools } = await client.listTools();
  expect(tools).toHaveLength(5);
  const result = await client.callTool({
    name: "get_season",
    arguments: { species_key: "EX1", state: "us-zz" },
  });
  const [content] = result.content as { text: string }[];
  expect(JSON.parse(content?.text ?? "null")).toMatchObject({
    release: RELEASE,
    result: { season: { middle: { week: 22 } } },
  });
  expect(data.requests).toContain("current.json");
  await client.close();
});

test("answers 404 away from /mcp", async () => {
  const { env } = await bindings();
  const response = await handle(new Request(`${HOST}/mcp/other`), env);
  expect(response.status).toBe(404);
});

test("answers 429 once an address is over the limit, keyed by address", async () => {
  const keys: string[] = [];
  const limiter: RateLimit = {
    limit: ({ key }) => {
      keys.push(key);
      return Promise.resolve({ success: false });
    },
  };
  const { env } = await bindings(limiter);
  const response = await handle(
    new Request(`${HOST}${MCP_PATH}`, {
      method: "POST",
      headers: { "cf-connecting-ip": "192.0.2.1" },
    }),
    env,
  );
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("60");
  expect(keys).toEqual(["192.0.2.1"]);
});

test("passes requests within the limit to the server", async () => {
  const { env } = await bindings({
    limit: () => Promise.resolve({ success: true }),
  });
  const response = await handle(
    new Request(`${HOST}${MCP_PATH}`, { method: "GET" }),
    env,
  );
  // A stateless server has no session to stream, so GET is not allowed.
  expect(response.status).toBe(405);
});
