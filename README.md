# openphenology-api

Read OpenPhenology data.

Not yet released, and the data is not yet published. The interface may change
before 1.0.0.

## Usage

```ts
import { createClient } from "openphenology-api";

const client = createClient();
const release = await client.release(); // the current release, read once

const result = await release.countyResult("us-oh", "39049", speciesKey);
if (result) {
  console.log(result.data.season, result.data.weekly.records);
}
```

- `client.release()` reads `current.json` once, so every later read comes from
  the same release. Pass `{ release: "2026-10-19" }` to pin one.
- `release.species()`, `release.region(state)`, `release.stateResult(state,
species)` and `release.countyResult(state, county, species)` read the
  published files. A result that is not published is `null`.
- Release files never change, so each is fetched at most once per client.
- `{ verify: true }` checks every file against its SHA-256 in the release
  manifest.
- Requests time out after 10 seconds and are retried twice after a network
  error or a 429 or 5xx response. Errors are `ApiError` (requests) or
  `FormatError` (content).
- Results show when people recorded a species, not when or where it occurs.
  Each result carries this note in `data.limits`.

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
```

## Licence

[MIT](LICENSE)
