# @openphenology/mcp

An MCP (Model Context Protocol) server that lets AI assistants read
OpenPhenology's published data through
[`@openphenology/api`](../../README.md).

**Not yet released.** A hosted endpoint at `https://api.openphenology.com/mcp`
and the full usage guide on data.openphenology.com are coming; see
[#44](https://github.com/openphenology/openphenology-api/issues/44).

## Tools

| Tool           | What it answers                                                                      |
| -------------- | ------------------------------------------------------------------------------------ |
| `find_species` | Species whose names contain some text, with their species keys                       |
| `find_county`  | The counties a ZIP code falls in, largest share of its land first                    |
| `get_season`   | When people recorded a species in a state or county: early, middle and late weeks    |
| `this_week`    | How each species is reported in a county in one week, from its Backyard labels       |
| `get_terms`    | The licence, how to cite and credit the data, the disclaimer and the contact address |

Every answer is JSON with three more fields:

- `release`: the release the facts come from;
- `limits`: what the results do not show. Results show when people recorded a
  species, not when or where it occurs, and a missing result never means
  absence;
- `terms`: the licence, and how to cite OpenPhenology and credit its sources.

The server also gives assistants instructions to pass `limits` on and credit
the data.

A server checks for a new release at most once an hour. ZIP codes are only
used to read the published postal file, and are never logged or stored.

## Hosted

`src/worker.ts` is the same server as a Cloudflare Worker, keeping no
sessions. `wrangler.jsonc` sets it up on staging only, at
`https://api-staging.openphenology.com/mcp`:

- it reads the published files through a service binding to the API Worker;
- it allows 60 requests a minute from each address, and 50 ms of CPU time
  per request;
- logging is off.

Production needs approval.

## Try it

From this repository, build it and start it over standard input and output:

```sh
pnpm build
node packages/mcp/dist/stdio.js
```
