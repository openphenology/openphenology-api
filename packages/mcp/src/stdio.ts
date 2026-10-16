#!/usr/bin/env node
// Runs the server over standard input and output, as assistants on the
// user's own machine start it.
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./index.ts";

await createServer().connect(new StdioServerTransport());
