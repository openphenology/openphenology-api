# @openphenology/api

Find out when each species is recorded, week by week, in US counties and
states, from OpenPhenology's published data.

The data is not yet published. The interface may change before 1.0.0.

## Install

```sh
npm install @openphenology/api
```

Works in Node.js 22 or later and in the last two versions of Chrome, Edge,
Firefox and Safari. It has no dependencies.

## Quick start

```ts
import { createClient } from "@openphenology/api";

const release = await createClient().release();

// Franklin County, Ohio
const result = await release.countyResult("us-oh", "39049", speciesKey);
if (result) {
  console.log(result.data.season); // [early, middle, late] weeks, or []
}
```

Your editor shows what every method takes, returns and throws.

## Reading the results

- **Results show when people recorded a species, not when or where it
  occurs.** Few or no records in a week does not mean the species is absent.
- **Weeks** run from 1 (1–7 January) to 53 (the last day or two of the year).
  Weekly lists always have 53 values.
- **`weekly.records`** counts the species' records each week. **`effort`**
  counts records of all species in the same place and week, so you can tell a
  busy species from a busy week.
- **`season`** is the species' early, middle and late weeks. It is empty when
  there isn't a clear season, and `season_withheld` says why.
- **Backyard labels** give each species one letter per week in a county:
  `c` commonly reported, `s` seasonally reported, `r` reported in your area,
  `m` within its mapped range, `n` not enough evidence.
- **Places** use codes: `us-oh` for a state, a 5-digit Census code such as
  `39049` for a county.
- **No result** comes back as `null`. Results with too little evidence, or for
  sensitive species, are never published.

## Examples

### This week's Backyard labels for a ZIP code

```ts
const week = (date: Date) => {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86_400_000 / 7) + 1;
};

const [county] = await release.zipCounties("43215"); // largest share first
if (county?.state) {
  const backyard = await release.backyard(county.state, county.area);
  for (const species of backyard?.data.species ?? []) {
    console.log(species.species_key, species.labels[week(new Date()) - 1]);
  }
}
```

### A county map

```ts
const outlines = await release.boundaries("us-oh");
// outlines.data is GeoJSON, ready for any map library
map.addSource("counties", { type: "geojson", data: outlines?.data });
```

### Species in each county of a state

```ts
const region = await release.region("us-oh");
for (const area of region?.data.areas ?? []) {
  console.log(area.name, area.species_keys.length);
}
```

## What you can read

From a release (`await client.release()`):

| Topic       | Methods                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Species     | `catalogue()`, `species(key)`, `speciesBySlug(slug)`, `groups()`, `searchNames()`                                                        |
| Places      | `region(state)`, `boundaries(state)`, `zipCounties(zip)`                                                                                 |
| Results     | `stateResult(state, species)`, `countyResult(state, county, species)`, `backyard(state, county)`, `attribution(state, species, county?)` |
| The release | `manifest()`, `notes()`, `methods()`, `sources()`                                                                                        |

From the client: `releases()` lists every release, and `terms()` gives the
licence and how to cite the data.

## Releases

Data is published in dated releases that never change.

- `client.release()` reads the current release once, so all your reads match.
- `createClient({ release: "2026-10-19" })` pins one release. If it has been
  withdrawn, `release()` throws.
- A long-running server should call `client.release({ refresh: true })` every
  few minutes to pick up a new release.

## Options

```ts
createClient({
  verify: true, // check every file against the release's SHA-256 list
  timeoutMs: 10_000, // per attempt; failed requests are retried twice
  signal, // an AbortSignal that cancels every request
});
```

## Errors

| Error         | When                                                                                   |
| ------------- | -------------------------------------------------------------------------------------- |
| `RangeError`  | A code is malformed, such as `"OH"` for a state. Raised before any request is made.    |
| `ApiError`    | A request failed, or a required file or release doesn't exist. Has `url` and `status`. |
| `FormatError` | A file isn't in a format this version reads. Has `path`.                               |

## Citing the data

The data is licensed CC BY 4.0. `client.terms()` says how to cite it, and
`release.attribution(...)` lists the sources behind each result.

## JSON Schemas

A JSON Schema for each file format is included, for checking files with any
validator:

```ts
import schema from "@openphenology/api/schemas/county-weekly-1.json" with { type: "json" };
```

## More

- [CHANGELOG.md](CHANGELOG.md): what changed in each version. Versions follow
  [Semantic Versioning](https://semver.org/); before 1.0.0, a breaking change
  bumps the minor version.
- [CONTRIBUTING.md](CONTRIBUTING.md): working on the package.
- [SECURITY.md](SECURITY.md): reporting a security problem.
- Licence: [MIT](LICENSE).
