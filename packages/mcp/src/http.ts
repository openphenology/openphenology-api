// The hosted MCP server's request handling, for the Worker in worker.ts. It
// keeps no sessions and logs nothing, so a ZIP code in a request is never
// stored. It reads the published files from the API address, as any client
// does.
import {
  createMcpHandler,
  type McpHttpHandler,
} from "@modelcontextprotocol/server";
import { createClient } from "@openphenology/api";
import { createServer } from "./index.ts";

/** The parts of a Cloudflare rate limiting binding the Worker uses. */
export interface RateLimit {
  /** Counts a request against `key`, and says whether it is within the limit. */
  limit: (options: { key: string }) => Promise<{ success: boolean }>;
}

/** The Worker's bindings and variables, from its Wrangler configuration. */
export interface Env {
  /** The API's address, such as `https://api-staging.openphenology.com/`. */
  readonly API_BASE_URL: string;
  /** Limits requests from each address; without it, nothing is limited. */
  readonly RATE_LIMITER?: RateLimit;
}

/** The path the Worker answers on. */
export const MCP_PATH = "/mcp";

/** One handler per API address, so a Worker's requests share its client's caches. */
const handlers = new Map<string, McpHttpHandler>();

/**
 * The MCP handler for a Worker's bindings, made once per address.
 *
 * @param env The bindings.
 * @returns The handler, making a server for each request.
 * @throws {TypeError} When `API_BASE_URL` is not a URL.
 */
function handlerFor(env: Env): McpHttpHandler {
  let handler = handlers.get(env.API_BASE_URL);
  if (!handler) {
    const client = createClient({ baseUrl: env.API_BASE_URL });
    handler = createMcpHandler(() => createServer({ client }));
    handlers.set(env.API_BASE_URL, handler);
  }
  return handler;
}

/**
 * Answers one request: MCP on {@link MCP_PATH}, `404` anywhere else, and `429`
 * once an address goes over the rate limit.
 *
 * @param request The request.
 * @param env The Worker's bindings.
 * @returns The response.
 * @throws {TypeError} When `API_BASE_URL` is not a URL.
 */
export async function handle(request: Request, env: Env): Promise<Response> {
  if (new URL(request.url).pathname !== MCP_PATH)
    return new Response("Not found", { status: 404 });
  if (env.RATE_LIMITER) {
    // The address is only a key for the limit; it is not stored with it.
    const key = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.RATE_LIMITER.limit({ key });
    if (!success)
      return new Response("Too many requests", {
        status: 429,
        headers: { "retry-after": "60" },
      });
  }
  return handlerFor(env).fetch(request);
}
