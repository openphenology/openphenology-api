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
  "OpenPhenology publishes when people recorded each species, week by week, in US states and counties. Every answer has `limits`: pass it on, and say a species was recorded or reported at a time, never that it occurs, is present or is absent then, or how common it is. A missing result never means absence. Call the 50th-percentile week the middle week, never the peak. Show a range label with its source and seasons. Credit the data with `terms.cite` and `terms.credit`; the licence is noncommercial.";

/** One reader per client, so servers made for each request share its caches. */
const readers = new WeakMap<Client, Reader>();

/** Options for {@link createServer}. */
export interface ServerOptions {
  /** The client to read data with. Defaults to one for the production API. */
  readonly client?: Client;
  /**
   * The clock, for this week's labels. Defaults to the system clock. Servers
   * made with the same client share the clock of the first.
   */
  readonly now?: () => Date;
  /**
   * How `find_county` takes a ZIP code: `full`, on the user's own device, or
   * `prefix`, the first three digits only, for a hosted server, so a whole ZIP
   * code never reaches it. Defaults to `full`.
   */
  readonly zip?: "full" | "prefix";
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
  const client = options.client ?? createClient();
  let reader = readers.get(client);
  if (!reader) {
    reader = new Reader(client, options.now);
    readers.set(client, reader);
  }
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

  if (options.zip === "prefix")
    server.registerTool(
      "find_county",
      {
        title: "Find the county for a ZIP code",
        description:
          "Every US ZIP code that starts with three digits, each with the counties it falls in, largest share of its land first. Send only the first three digits of the user's ZIP code, never all five, then pick the user's ZIP code from the list yourself; its counties' codes work in the other tools.",
        inputSchema: z.object({
          zip_prefix: z
            .string()
            .regex(/^\d{3}$/)
            .describe("The first three digits of a ZIP code, such as `432`."),
        }),
        annotations,
      },
      async ({ zip_prefix }) =>
        reply(await reader.findCountiesByPrefix(zip_prefix)),
    );
  else
    server.registerTool(
      "find_county",
      {
        title: "Find the county for a ZIP code",
        description:
          "The US counties a ZIP code falls in, largest share of its land first, with their codes for the other tools. Only the published file for its first three digits is read; the ZIP code is never sent anywhere else or stored.",
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
    "get_records",
    {
      title: "Get the records behind a result",
      description:
        "The records behind a species' result in a state or county: how many, the datasets they came from, and links to the first of them, each to its own observation or GBIF page. A sensitive species has no record links. Give a county for a county's result.",
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
      reply(await reader.records(species_key, state, county)),
  );

  server.registerTool(
    "this_week",
    {
      title: "What's recorded this week",
      description:
        "How each species is reported in a county in one week, from its Nearby labels: commonly reported, seasonally reported, reported in the area, or within its mapped range. Species without enough evidence that week are left out.",
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
