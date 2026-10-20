import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createClient } from "@openphenology/api";
import { expect, test } from "vitest";
import { createHttpHandler } from "../src/http.ts";
import { fakeServer, RELEASE } from "../../../test/fixture.ts";

const HOST = "https://mcp.example.test/";

/** Connects an MCP client over HTTP to a handler reading the made-up release. */
async function connect() {
  const data = await fakeServer();
  const handle = createHttpHandler({
    client: createClient({
      baseUrl: "https://example.test/",
      fetch: data.fetch,
    }),
  });
  const transport = new StreamableHTTPClientTransport(new URL(HOST), {
    fetch: (input, init) => handle(new Request(input, init)),
  });
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(transport);
  return { client, data, handle };
}

test("serves the tools over HTTP", async () => {
  const { client, data } = await connect();
  const { tools } = await client.listTools();
  expect(tools).toHaveLength(6);
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

test("takes only a ZIP code's first three digits", async () => {
  const { client } = await connect();
  const { tools } = await client.listTools();
  const findCounty = tools.find((tool) => tool.name === "find_county");
  expect(Object.keys(findCounty?.inputSchema.properties ?? {})).toEqual([
    "zip_prefix",
  ]);
  const whole = await client.callTool({
    name: "find_county",
    arguments: { zip: "99901" },
  });
  expect(whole.isError).toBe(true);
  await client.close();
});

test("keeps no sessions", async () => {
  const { handle } = await connect();
  // A stateless server has no session stream to open, so GET is refused.
  const response = await handle(new Request(HOST, { method: "GET" }));
  expect(response.status).toBe(405);
});
