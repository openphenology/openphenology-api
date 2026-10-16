/**
 * An MCP server that lets AI assistants read OpenPhenology's published data.
 *
 * @packageDocumentation
 */
import { McpServer } from "@modelcontextprotocol/server";

/** The name and version the server reports to assistants. */
export const SERVER_INFO = { name: "openphenology", version: "0.0.0" };

/**
 * Creates the MCP server, ready to connect to a transport.
 *
 * @returns A server that is not yet connected.
 */
export function createServer(): McpServer {
  return new McpServer(SERVER_INFO);
}
