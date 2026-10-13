# Changelog

All notable changes to this package are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `catalogue/1.1`: each catalogue species has `seasons`, its season weeks in
  each state with a result (data rules 1.20). `catalogue/1.0` files, which lack
  it, still read.

## [0.1.0] - 2026-10-13

First release.

### Added

- Read the current release, pin one by date, or refresh to pick up a new one.
  A pinned release that has been withdrawn is an error.
- Species: the catalogue, species pages, slugs, browse groups and search
  names.
- Places: regions, county outlines, and the counties and states a ZIP code
  falls in.
- Results: state and county weekly results, Backyard labels and attribution.
- About the data: the release list, terms, manifest, notes, methods and
  sources.
- Files split into shards are read as one file.
- Checks on every file's format version and 53-week lists, and optional
  SHA-256 checks against the manifest.
- Timeouts, retries, and `ApiError` and `FormatError` errors, each with a
  stable `code`.
- TypeScript types with documentation, and a JSON Schema for each file format
  with every field described and a made-up example file.
- Works in Node.js and browsers, and installs from npm or a Git commit.
- `llms.txt`: the whole package on one page, for AI coding agents.

[Unreleased]: https://github.com/openphenology/openphenology-api/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/openphenology/openphenology-api/releases/tag/v0.1.0
