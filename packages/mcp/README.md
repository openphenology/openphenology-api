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

Fixed wording comes from the published data rules word for word: the Backyard
labels, why season weeks are withheld, and what a missing result means. A
species under "Within its mapped range" comes with the range's source and
seasons.

A server checks for a new release at most once an hour.

**ZIP codes.** By default, `find_county` takes a whole ZIP code and reads only
the published postal file for its first three digits; the ZIP code is never
sent anywhere else or stored. A hosted server is made with
`createServer({ zip: "prefix" })`: its `find_county` takes only the first three
digits and returns every ZIP code under them, and the assistant picks the
user's own, so a whole ZIP code never reaches the server.

## Try it

From this repository, build it and start it over standard input and output:

```sh
pnpm build
node packages/mcp/dist/stdio.js
```
