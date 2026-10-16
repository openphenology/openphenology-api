/**
 * An MCP server that lets AI assistants read OpenPhenology's published data.
 *
 * @packageDocumentation
 */
import { McpServer } from "@modelcontextprotocol/server";
import { createClient, type Client } from "@openphenology/api";
import { z } from "zod";
import { Reader } from "./tools.ts";

export { describeWeek, type Answer, type Credit, type Week } from "./tools.ts";

/** The name and version the server reports to assistants. */
export const SERVER_INFO = { name: "openphenology", version: "0.0.0" };

/** What the server tells assistants about every tool's answers. */
const INSTRUCTIONS =
  "OpenPhenology publishes when people recorded each species, week by week, in US states and counties. Every answer has `limits`: pass it on, and say a species was recorded or reported at a time, never that it occurs, is present or is absent then. A missing result never means absence. Credit the data with `terms.cite` and `terms.credit`; the licence is noncommercial.";

/** Options for {@link createServer}. */
export interface ServerOptions {
  /** The client to read data with. Defaults to one for the production API. */
  readonly client?: Client;
  /** The clock, for this week's labels. Defaults to the system clock. */
  readonly now?: () => Date;
}

const state = z
  .string()
  .describe(
    "The state code: `us-` and the postal abbreviation, such as `us-oh`.",
  );
const county = z
  .string()
  .describe("The county's 5-digit Census code (GEOID), such as `39049`.");

/**
 * Turns an answer into a tool result.
 *
 * @param answer The answer.
 * @returns The answer as JSON text.
 */
const reply = (answer: object) => ({
  content: [{ type: "text" as const, text: JSON.stringify(answer, null, 2) }],
});

/** Every tool only reads public files. */
const annotations = { readOnlyHint: true, openWorldHint: true };

/**
 * Creates the MCP server, with its tools, ready to connect to a transport.
 *
 * @param options The client to read data with, and the clock.
 * @returns A server that is not yet connected.
 */
export function createServer(options: ServerOptions = {}): McpServer {
  const reader = new Reader(options.client ?? createClient(), options.now);
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });

  server.registerTool(
    "find_species",
    {
      title: "Find a species",
      description:
        "Finds species by part of a scientific, common or other name, exact matches first. Returns up to 10, each with its species key for the other tools.",
      inputSchema: z.object({
        name: z.string().min(2).describe("Part of a name, such as `cardinal`."),
      }),
      annotations,
    },
    async ({ name }) => reply(await reader.findSpecies(name)),
  );

  server.registerTool(
    "find_county",
    {
      title: "Find the county for a ZIP code",
      description:
        "The US counties a ZIP code falls in, largest share of its land first, with their codes for the other tools. The ZIP code is used only to read the published postal file and is never stored.",
      inputSchema: z.object({
        zip: z.string().describe("A 5-digit ZIP code, such as `43215`."),
      }),
      annotations,
    },
    async ({ zip }) => reply(await reader.findCounty(zip)),
  );

  server.registerTool(
    "get_season",
    {
      title: "Get a species' season",
      description:
        "When people recorded a species in a state or county: its early, middle and late weeks (5th, 50th and 95th percentiles of the records), or why they are withheld. Give a county for a county's season; its state is found from it when left out.",
      inputSchema: z.object({
        species_key: z
          .string()
          .describe("The species key, from `find_species`."),
        state: state.optional(),
        county: county.optional(),
      }),
      annotations,
    },
    async ({ species_key, state, county }) =>
      reply(await reader.season(species_key, state, county)),
  );

  server.registerTool(
    "this_week",
    {
      title: "What's recorded this week",
      description:
        "How each species is reported in a county in one week, from its Backyard labels: commonly reported, seasonally reported, reported in the area, or within its mapped range. Species without enough evidence that week are left out.",
      inputSchema: z.object({
        county,
        state: state.optional(),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("The day, `YYYY-MM-DD`; today when left out."),
        group: z
          .string()
          .optional()
          .describe("Only species in this browse group, such as `birds`."),
      }),
      annotations,
    },
    async ({ county, state, date, group }) =>
      reply(await reader.thisWeek(county, state, date, group)),
  );

  server.registerTool(
    "get_terms",
    {
      title: "Get the terms and how to cite",
      description:
        "The data's licence, how to cite OpenPhenology and credit its sources, the disclaimer and the contact address.",
      annotations,
    },
    async () => reply(await reader.terms()),
  );

  return server;
}
