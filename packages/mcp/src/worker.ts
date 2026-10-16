// The hosted MCP server: a Cloudflare Worker on the API host's /mcp route.
// Workers treats each named export of this module as an entrypoint, so it
// exports only the handler; the rest is in http.ts.
import { handle } from "./http.ts";

export default { fetch: handle };
