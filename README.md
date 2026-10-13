# @openphenology/api

Read OpenPhenology data: when people record each species, week by week, in
every US county and state with enough evidence.

Not yet released, and the data is not yet published. The interface may change
before 1.0.0.

The package has no dependencies and runs in Node.js and in browsers. Every
export is documented in its TypeScript types, so your editor shows what each
method takes, returns and throws.

## Quick start

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

## What the data means

- **Results show when people recorded a species, not when or where it
  occurs.** Missing weeks and low counts do not mean absence or scarcity, and
  counts are not abundance. Each result carries this note in `data.limits`.
- **Weeks** run from 1 to 53: week 1 is 1–7 January, week 2 is 8–14 January,
  and week 53 is the last one or two days of the year. Every weekly list has 53
  values. All years from 2020 are pooled.
- **A result** counts the species' records in each week (`weekly.records`) and
  the years contributing to each week (`weekly.years`). `effort` counts the
  records of all species in the same area and week, so a busy week can be told
  apart from a busy species.
- **`season`** gives the early, middle and late weeks (5th, 50th and 95th
  percentiles), or `[]` when they are withheld. `season_withheld` then says
  why: `year-round`, `two-seasons`, `one-year` or `precision`.
- **Backyard labels** give each species one letter per week in a county:
  `c` commonly reported this time of year, `s` seasonally reported, `r`
  reported in your area, `m` within its mapped range, `n` not enough evidence.
- **Areas** are named by code: lowercase ISO 3166-2 for a state (`us-oh`), the
  US Census GEOID for a county (`39049`).
- **A missing result looks the same as a withheld one.** A result withheld to
  protect a sensitive species, or for too little evidence, is not published,
  so the client returns `null` either way.

## Examples

### A county result in the browser

```ts
import { createClient } from "@openphenology/api";

const release = await createClient().release();
const result = await release.countyResult("us-oh", "39049", speciesKey);

const week = (date: Date): number => {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86_400_000 / 7) + 1;
};
const thisWeek = week(new Date());
console.log(result?.data.weekly.records[thisWeek - 1]);
```

Requests are plain `GET`s with no custom headers, so browsers send no CORS
preflight.

### A script in Node.js

```ts
// list-species.mjs: node list-species.mjs
import { createClient } from "@openphenology/api";

const release = await createClient().release();
const region = await release.region("us-oh");
for (const area of region?.data.areas ?? []) {
  console.log(area.name, area.species_keys.length);
}
```

### A county map

`boundaries(state)` returns the state's county outlines. Its `data` is a
GeoJSON FeatureCollection, ready for any map library; each feature's
`properties.area` is the county's GEOID. The outlines are simplified for
display only.

```ts
const outlines = await release.boundaries("us-oh");
map.addSource("counties", { type: "geojson", data: outlines?.data });
```

### From a ZIP code to its Backyard labels

```ts
const thisWeek = week(new Date()); // `week` from the first example
const counties = await release.zipCounties("43215"); // largest share first
const county = counties[0];
if (county) {
  const backyard = await release.backyard("us-oh", county.area);
  for (const species of backyard?.data.species ?? []) {
    console.log(species.species_key, species.labels[thisWeek - 1]);
  }
}
```

## Reading the data

- `client.release()` reads `current.json` once, so every later read comes from
  the same release. Pass `createClient({ release: "2026-10-19" })` to pin one.
  A pinned release that is not published, or has been withdrawn, is an
  `ApiError` (status 404).
- `client.release({ refresh: true })` reads `current.json` again and returns
  the release it names now. A long-running server should refresh every few
  minutes; `current.json` is cached for about 5 minutes. A release already
  returned keeps reading its own files.
- A release reads its files by name. A file that is not published is `null`.
  - Species: `catalogue()`, `species(key)`, `speciesBySlug(slug)`, `groups()`
    and `searchNames()`.
  - Places: `region(state)`, `boundaries(state)` and `zipCounties(zip)`.
  - Results: `stateResult(state, species)`,
    `countyResult(state, county, species)`,
    `attribution(state, species, county?)` and `backyard(state, county)`.
  - About the release: `manifest()`, `notes()`, `methods()` and `sources()`.
- `client.releases()` lists every release.
- A file split into numbered shards (`catalogue/0.json`, `catalogue/1.json`,
  …) is read as one file, its lists joined in order.
- Release files never change, so each is fetched at most once per client.
- `{ verify: true }` checks every file against its SHA-256 in the release
  manifest.

### Errors

- A state, county, species or ZIP code that could change the path throws a
  `RangeError` straight away.
- A failed request rejects with an `ApiError`, which carries the `url` and,
  when a response arrived, its `status`. Requests time out after 10 seconds and
  are retried twice after a network error or a 429 or 5xx response.
- A malformed file rejects with a `FormatError`, which carries the file's
  `path`. Every file's format and major version are checked, and every weekly
  list must hold 53 weeks: result counts and effort, region effort, and
  Backyard effort and labels.

## Citing and crediting the data

The data is licensed CC BY 4.0. `client.terms()` says how to cite
OpenPhenology and credit its sources. `release.attribution(state, species,
county?)` lists the datasets, GBIF download DOIs and record links behind each
result. For a sensitive species, record links are `null`.

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

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) to work on the package, and
[SECURITY.md](SECURITY.md) to report a security problem privately.

## Licence

[MIT](LICENSE)
