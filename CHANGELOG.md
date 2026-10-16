# Changelog

All notable changes to this package are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Data rules 1.37 (`formats.md` 1.19): `region/1.2`. Each area may carry
  `daylight`: 53 weekly `[sunrise, sunset, hours]` (`DaylightWeek`), local
  `HH:MM` times and hours of daylight at the area's centre for each week's
  middle day in the release's year, or `null` for a week with no sunrise or
  sunset. They describe the place only. Absent from earlier files.
- Data rules 1.35 (`formats.md` 1.18): `region/1.1`. Each area may carry
  `ecoregions` (`Ecoregion`): the RESOLVE Ecoregions 2017 ecoregions it lies
  in, with `ecoregion` (RESOLVE's `ECO_ID`), `name`, `biome` and `share` (of
  the area's land, 0.05 or more), largest share first. They label the place
  only, never the species recorded there. Absent from earlier files.
- Data rules 1.34 (`formats.md` 1.17, `protection.md` 1.3): `species/1.10`.
  Each area result may carry `record_dates`, how many distinct dates its
  counted records fall on, and `latest_month`, the month of the latest of
  them (`YYYY-MM`). Both are `null` for a species sensitive in the state and
  absent from earlier files. They say when people recorded the species,
  never whether it is there now.
- Data rules 1.33 (`formats.md` 1.16, `seasonal.md` 1.5): `species/1.9`.
  A result withheld as `two-seasons`, and a flowering result, may carry
  `windows` (`SeasonWindow`): the two windows its records split into at the
  valley between the peaks, each with `records`, `season` and
  `season_withheld` (which may be `too-few-records`). It is `null` otherwise
  and absent from earlier files. Windows say when, never why there are two.
- Data rules 1.32 (`formats.md` 1.15, `seasonal.md` 1.4, ODR-2026-025):
  `species/1.8`. Each area result may carry `flowering` (`Flowering`): for a
  plant, the result from its records that show flowers, with `records`,
  `season` and `season_withheld`, which may be `too-few-records`
  (`FloweringWithheld`). It is `null` for a species that is not a plant and
  absent from earlier files. It describes when people recorded the plant with
  flowers showing, not when it flowers.
- Data rules 1.31 (`formats.md` 1.14, ODR-2026-028): `species/1.7`. Each area
  result may carry `conditions` (`Conditions`): the medians of `sunrise` and
  `sunset` (local `HH:MM`, calculated with NOAA's solar calculation) and of
  the daily `high`, `low` and `midpoint` (°C, from NOAA nClimGrid-Daily, lower
  48 states only) over the records the season counts. `midpoint` is the mean
  of the day's high and low, not an average through the day. A value is
  `null` when too few records have it; `conditions` is absent from earlier
  files.
- Data rules 1.30 (`formats.md` 1.13): `manifest/2.0`. A manifest larger
  than 500 KB is split on `files`; its first part stays at `manifest.json`,
  then `manifest/1.json` and so on, and `parts` says how many there are.
  `Release.manifest()` reads every part and joins `files`, so verification
  finds files listed in any part. `manifest/1.0` files, which have no
  `parts`, are still read. The schema is now `schemas/manifest-2.json`;
  `manifest-1.json` is gone. Other formats stay at major version 1.
- Data rules `formats.md` 1.11 (data rules 1.26): `catalogue/1.3` adds,
  per species, `sensitive_in`, `listed_in` and `introduced_in`, the states
  in `states` where its records are sensitive because of the species, where
  a listing in its `statuses` applies, and where a US-RIIS listing applies.
  They describe the species, never a location, and are absent from
  `catalogue/1.2` and earlier files.
- The README, `llms.txt`, the package description and the Postman
  collection say OpenPhenology and this package are in beta.
- Data rules `formats.md` 1.9, each readable alongside the earlier files:
  - `species/1.4` and `catalogue/1.2`: `photo`, the species' photo
    (`SpeciesPhoto`: `id`, `source`, `sizes` per Brand Guide role, `credit`,
    `licence`, `licence_url`, `url`) or `null`. Photos keep their own licence.
  - `species/1.5`: `below_species`, per state the subspecies, varieties and
    forms its records were identified to (`BelowSpecies`), names only, and
    `other_below_species`.
- Data rules 1.24, each readable alongside the earlier files:
  - `species/1.3`: `inaturalist_taxon_id`, the species' iNaturalist taxon
    ID or `null`.
  - `search/1.1`: names of kind `other-name`, the species' other English
    common names.
  - `backyard/1.1`: each species' county `records`, `weekly`, `season` and
    `season_withheld`, repeating its county result, or `null`, `null`, `[]`
    and `null` without one.
  - The manifest lists `archive.tar.gz`, every other file of the release in
    one download, with `format` `null`; `ManifestEntry.format` is now
    `string | null`.
- `terms/1.1`: `scope`, what the CC BY 4.0 licence covers, word for word as
  the data rules give it (data rules 1.23). `terms/1.0` files, which lack it,
  still read.
- `species/1.2`: each species has `introductions`, its US-RIIS listings in
  the lower 48 states as introduced or invasive (data rules 1.22), as
  `SpeciesIntroduction`. Earlier species files, which lack it, still read.
- `species/1.1`: each species has `statuses`, its listings on the federal
  Endangered Species Act list and Ohio's lists (data rules 1.21), as
  `SpeciesListing`. `species/1.0` files, which lack it, still read.
- A Postman collection in `postman/` (not in the npm package): a request for
  every published file kind, with descriptions, examples and tests that check
  each file against its JSON Schema.
- `weekOf`, `BACKYARD_LABELS` and `backyardLabel`: weeks and Backyard
  labels as the data rules define them, so every reader counts weeks the way
  the data was made.
- `@openphenology/api/format`: weeks, Backyard labels, `countyState` and the
  data's addresses without the reader, for pages that need only those.
- `client.current()`: `current.json` itself, with when the release was
  published.
- `countyState(county)`: the state a county's Census code is in.
- `schemas/all-1.json`: every format's JSON Schema in one file, by kind.
- `release.postal(prefix)`: every ZIP code with a 3-digit prefix, for ZIP code
  lists and suggestions.
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
