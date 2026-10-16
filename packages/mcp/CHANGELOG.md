# Changelog

All notable changes to `@openphenology/mcp` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- An MCP server for OpenPhenology's published data, with five read-only
  tools: `find_species`, `find_county`, `get_season`, `this_week` and
  `get_terms`. Every answer carries the release, the note on what results do
  not show, and how to cite and credit the data.
- `openphenology-mcp`, to run it over standard input and output.
- `@openphenology/mcp/http`: `createHttpHandler`, to host it over HTTP, with
  `find_county` taking only a ZIP code's first three digits.
