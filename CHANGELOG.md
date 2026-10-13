# Changelog

All notable changes to this package are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Client that reads the current or a pinned release: the species catalogue,
  species pages, slugs, groups and search names; regions, county outlines and
  ZIP code counties; state and county results, attribution and Backyard
  labels; the manifest, notes, methods and sources; and the release list and
  terms.
- Files split into shards are read as one file.
- A pinned release that is not available is an `ApiError` when it opens.
- `client.release({ refresh: true })` picks up a new current release.
- Optional SHA-256 checks against the release manifest.
- Timeouts, retries, and `ApiError` and `FormatError` errors.
- Checks that weekly lists hold 53 weeks in results, regions and Backyard
  files, and that Backyard labels are valid letters.
- TypeScript types for the published files, with JSDoc on every export and
  field.
- Installs from a Git commit: a `prepare` script builds the package.
- A JSON Schema for each file format, at
  `@openphenology/api/schemas/<kind>-1.json`.
