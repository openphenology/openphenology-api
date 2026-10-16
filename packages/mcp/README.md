# @openphenology/mcp

An MCP (Model Context Protocol) server that lets AI assistants read
OpenPhenology's published data through
[`@openphenology/api`](../../README.md).

**Not yet released.** Its tools, a hosted endpoint at
`https://api.openphenology.com/mcp` and the full usage guide on
data.openphenology.com are coming; see
[#44](https://github.com/openphenology/openphenology-api/issues/44).

To try it from this repository, build and start it over standard input and
output:

```sh
pnpm build
node packages/mcp/dist/stdio.js
```
