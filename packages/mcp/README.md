# @openphenology/mcp

An MCP (Model Context Protocol) server that lets AI assistants read
OpenPhenology's published data through
[`@openphenology/api`](../../README.md).

**Not yet released.** A hosted server at `https://mcp.openphenology.com` and
the full usage guide on data.openphenology.com are coming; see
[#44](https://github.com/openphenology/openphenology-api/issues/44).

## Tools

| Tool          | What it answers                                                                      |
| ------------- | ------------------------------------------------------------------------------------ |
| `search`      | Species and places by name, and a place's species in season between two dates        |
| `find_county` | The counties a ZIP code falls in, largest share of its land first                    |
| `get_season`  | When people recorded a species in a state or county: early, middle and late weeks    |
| `get_records` | The records behind a result: how many, their datasets, and links to the first 20     |
| `this_week`   | How each species is reported in a county in one week, from its Nearby labels         |
| `get_terms`   | The licence, how to cite and credit the data, the disclaimer and the contact address |

Every answer is JSON with three more fields:

- `release`: the release the facts come from;
- `limits`: what the results do not show. Results show when people recorded a
  species, not when or where it occurs, and a missing result never means
  absence;
- `terms`: the licence, and how to cite OpenPhenology and credit its sources.

The server also gives assistants instructions to pass `limits` on and credit
the data.

Fixed wording comes from the published data rules word for word: the Nearby
labels, why season weeks are withheld, and what a missing result means. A
species under "Within its mapped range" comes with the range's source and
seasons.

A server checks for a new release at most once an hour.

**Search.** `search` calls `release.search()` from `@openphenology/api`
(ODR-2026-070), the same search as the site, with any of its inputs: `text`,
`place`, `from` and `to` (`MM-DD`, both or neither), `group` and `sort`
(`name`, `season`, `records` or `group`). Text alone finds species by any of
their names and places by name, each with its code; a place or dates list the
species with a season there, or whose season overlaps the dates. A place is a
code from the published lists: `anywhere`, a state such as `us-oh`, a
county's 5-digit Census code, or a park's `park-` or metro park system's
`parks-` code. Search a place's name to get its code, or use `find_county`
for a ZIP code's counties. It answers with up to 25 species and 25 places of
each kind. The text is never repeated back.

**ZIP codes.** `search` never looks up a ZIP code: text that is a ZIP code
matches nothing and is not repeated back. By default, `find_county` takes a whole ZIP code and reads only
the published postal file for its first three digits; the ZIP code is never
sent anywhere else or stored. A hosted server is made with
`createServer({ zip: "prefix" })`: its `find_county` takes only the first three
digits and returns every ZIP code under them, and the assistant picks the
user's own, so a whole ZIP code never reaches the server.

## Hosted

`@openphenology/mcp/http` serves the same server over stateless streamable
HTTP, for a host such as a Cloudflare Worker:

```js
import { createHttpHandler } from "@openphenology/mcp/http";

const handle = createHttpHandler();
export default { fetch: (request) => handle(request) };
```

It keeps no sessions and logs nothing, and its `find_county` takes only a ZIP
code's first three digits. `@openphenology/api` is a peer dependency: the host
installs it beside this package. Routing, rate limits and access control are left to
the host. OpenPhenology will host it at `https://mcp.openphenology.com`.

## Try it

From this repository, build it and start it over standard input and output:

```sh
pnpm build
node packages/mcp/dist/stdio.js
```
