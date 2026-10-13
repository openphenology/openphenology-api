# @openphenology/api

Read OpenPhenology data.

Not yet released, and the data is not yet published. The interface may change
before 1.0.0.

## Usage

```ts
import { createClient } from "@openphenology/api";

const client = createClient();
const release = await client.release(); // the current release, read once

const result = await release.countyResult("us-oh", "39049", speciesKey);
if (result) {
  // season is [early, middle, late] weeks, or [] with season_withheld saying why
  console.log(result.data.season, result.data.weekly.records);
}
```

- `client.release()` reads `current.json` once, so every later read comes from
  the same release. Pass `{ release: "2026-10-19" }` to pin one. A pinned
  release that is not published, or has been withdrawn, is an `ApiError`
  (status 404).
- A release reads its files by name. A file that is not published is `null`.
  - Species: `catalogue()`, `species(key)`, `speciesBySlug(slug)`, `groups()`
    and `searchNames()`.
  - Places: `region(state)`, `boundaries(state)` (county outlines for maps)
    and `zipCounties(zip)`.
  - Results: `stateResult(state, species)`, `countyResult(state, county,
species)`, `attribution(state, species, county?)` and `backyard(state,
county)`.
  - About the release: `manifest()`, `notes()`, `methods()` and `sources()`.
- `client.releases()` lists every release; `client.terms()` gives the licence
  and how to cite and credit the data.
- A file split into numbered shards (`catalogue/0.json`, `catalogue/1.json`,
  …) is read as one file, its lists joined in order.
- Release files never change, so each is fetched at most once per client.
- `{ verify: true }` checks every file against its SHA-256 in the release
  manifest.
- Requests time out after 10 seconds and are retried twice after a network
  error or a 429 or 5xx response. Errors are `ApiError` (requests) or
  `FormatError` (content).
- Results show when people recorded a species, not when or where it occurs.
  Each result carries this note in `data.limits`.

## Schemas

The package includes a JSON Schema (2020-12) for each file format, named
`<kind>-<major>.json`. Use them to check files with any JSON Schema validator:

```ts
import schema from "@openphenology/api/schemas/county-weekly-1.json" with { type: "json" };
```

A schema accepts every minor version of its major version, and fields a later
minor version adds.

## Requirements

Works on servers and in browsers:

- Node.js 22 or later, with npm, pnpm or Yarn
- the last two versions of Chrome, Edge, Firefox and Safari, including Safari
  on iOS

## Versioning

Follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html):
major for breaking changes, minor for new features, patch for fixes. Before
1.0.0, a breaking change bumps the minor version.
Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## Development

Needs Node.js 24 and pnpm (`corepack enable`).

```sh
pnpm install
pnpm exec playwright install chromium firefox webkit   # test browsers
pnpm check    # formatting, lint, typecheck, tests in Node.js and browsers, build, size
pnpm format   # fix formatting
pnpm schemas  # write schemas/*.json from schemas/index.ts
```

## Licence

[MIT](LICENSE)
