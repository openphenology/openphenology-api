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
- `get_records` (ODR-2026-052): the records behind a state's or county's
  result: how many, their datasets and GBIF download DOIs, and the first 20
  links, each to its own observation or GBIF page; no links for a sensitive
  species.
- `@openphenology/mcp/http`: `createHttpHandler`, to host it over HTTP, with
  `find_county` taking only a ZIP code's first three digits.
- `@openphenology/api` is a peer dependency, so the server shares the host's
  client, and the package builds itself when installed from Git.
