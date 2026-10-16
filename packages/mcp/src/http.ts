// The MCP server over HTTP, for a hosted server such as a Cloudflare Worker.
// It keeps no sessions and logs nothing, and its find_county takes only a ZIP
// code's first three digits, so a whole ZIP code never reaches it.
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createClient, type Client } from "@openphenology/api";
import { createServer } from "./index.ts";

/** Options for {@link createHttpHandler}. */
export interface HttpOptions {
  /** The client to read data with. Defaults to one for the production API. */
  readonly client?: Client;
}

/**
 * Creates a web-standard request handler that serves the MCP server over
 * stateless streamable HTTP, making a server for each request. Requests share
 * the client's caches. Routing, rate limits and access control are the host's.
 *
 * @param options The client to read data with.
 * @returns A function that answers one request.
 * @example
 * const handle = createHttpHandler();
 * export default { fetch: (request: Request) => handle(request) };
 */
export function createHttpHandler(
  options: HttpOptions = {},
): (request: Request) => Promise<Response> {
  const client = options.client ?? createClient();
  const handler = createMcpHandler(() =>
    createServer({ client, zip: "prefix" }),
  );
  return (request) => handler.fetch(request);
}
