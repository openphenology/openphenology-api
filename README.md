# @openphenology/api (beta)

Find out when each species is recorded, week by week, in US counties and
states, and in watersheds, ecoregions and parks, from OpenPhenology's
published data.

> **Beta.** OpenPhenology and this package are in beta: the interface may
> change before 1.0.0, and published file formats change only by version.

> **Not live yet.** The first data release hasn't been published, so until it
> is, `release()` fails with an `ApiError` (status 404). Everything below works
> as soon as it is.

## Quick start

1. Install the package. It needs Node.js 22 or later, and has no
   dependencies.

   ```sh
   npm install @openphenology/api
   ```

2. Save this as `season.mjs`:

   ```js
   import { createClient } from "@openphenology/api";

   const release = await createClient().release(); // the current release

   const key = await release.speciesBySlug("northern-cardinal");
   if (key) {
     // Franklin County, Ohio
     const result = await release.countyResult("us-oh", "39049", key);
     console.log(result?.data.season); // e.g. [14, 22, 35]: early, middle, late week
   }
   ```

3. Run it:

   ```sh
   node season.mjs
   ```

In a browser app, import the package the same way through your bundler, such
as Vite or webpack. It works in the last two versions of Chrome, Edge,
Firefox and Safari. Types are included, and your editor shows what every
method takes, returns and throws.

## Finding species and places

Every read takes codes, not names:

| You have                       | Get the code with                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A species' page slug           | `release.speciesBySlug("northern-cardinal")`                                                                                                           |
| A name someone typed           | `release.search({ text })`: species and places whose names match, as the site finds them                                                               |
| Nothing yet                    | `release.catalogue()`: every species with a result                                                                                                     |
| A state                        | `us-` and its postal abbreviation, such as `us-oh`                                                                                                     |
| A county                       | `release.region("us-oh")` lists each county's 5-digit Census code                                                                                      |
| A ZIP code                     | `release.zipCounties("43215")` gives its counties and their states                                                                                     |
| A watershed, ecoregion or park | `release.places("parks")` lists each place's code, such as `huc8-04100011`, `eco-342`, `park-hocking-hills-state-park` or `parks-cleveland-metroparks` |

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
- **Nearby labels** give each species one letter per week in a county:
  `c` commonly reported, `s` seasonally reported, `r` reported in your area,
  `m` within its mapped range, `n` not enough evidence.
- **Places** use codes: `us-oh` for a state, a 5-digit Census code such as
  `39049` for a county, and `huc8-`, `eco-`, `park-` or `parks-` codes for
  watersheds, ecoregions, parks and metro park systems. A place that runs
  into a state not covered yet has results from its covered part only, and
  sensitive species never have place results.
- **Place labels** give each species with a result in a place one letter per
  week, from the place's own result: `c`, `s` or `r`, as in Nearby.
- **No result** comes back as `null`. Results with too little evidence, or for
  sensitive species, are never published.

## Examples

These continue from the quick start, with `release` already open.

### This week's Nearby labels for a ZIP code

```ts
import { NEARBY_LABELS, nearbyLabel, weekOf } from "@openphenology/api";

const week = weekOf(new Date()); // weeks as the data rules count them
const [county] = await release.zipCounties("43215"); // largest share first
if (county?.state) {
  const nearby = await release.nearby(county.state, county.area);
  for (const species of nearby?.data.species ?? []) {
    const label = nearbyLabel(species.labels, week);
    console.log(species.species_key, NEARBY_LABELS[label]);
  }
}
```

### Search, as the site does

`release.search()` is the site's search (ODR-2026-070 as amended by
ODR-2026-071). Every input is optional, and they combine:

```ts
// By name: species by any of their names, best match first, and places.
const byName = await release.search({ text: "aster" });
for (const s of byName.species) console.log(s.key, s.note); // "Formerly …"
for (const p of byName.places) console.log(p.kind, p.area, p.name, p.species);

// A place and dates: species whose season there overlaps them.
const fall = await release.search({
  place: "39049", // `anywhere`, a state, a county, or a park's code
  from: "09-01", // MM-DD, no year; give both or neither
  to: "10-15",
  group: "plants",
  sort: "season", // or "name", "records", "group"
});
console.log(fall.advanced?.inSeason, fall.species[0]?.season);

// A stage and a status, with what each filter option would leave.
const flowering = await release.search({
  place: "us-oh",
  stage: "in-flower", // or "in-fruit", "adults", "larvae"
  status: "introduced", // or "invasive"
});
for (const s of flowering.species) console.log(s.stageLabel, s.stageSeason);
for (const o of flowering.advanced?.options.stages ?? [])
  console.log(o.label, o.count); // "Reported in flower" 12
```

A `stage` keeps the species reported at that stage there, sorted and matched
to the dates by that stage's season. Each is worded as ODR-2026-032 sets out
(`stageLabel`): "Reported in flower", "Reported in fruit", "Reported as an
adult", "Reported as a larva", and "Reported as a caterpillar" for a
butterfly or moth; never the stage alone. A `status` keeps the species
US-RIIS lists there (`data/status.md`): `introduced` takes invasive ones too,
and `invasive` only those. A species with no listing has `status: null`,
which never means native.

With a place or Anywhere, `advanced.options` gives the group, stage and
status options of the shared filter (ODR-2026-037), each with how many
species it would leave with the other filters in force. A kind that would
not split the list is empty. The site shows the filter only on a list of
more than 20 species, but the package applies the filters to any list.

Under Anywhere, a species covered in more than one state is listed once
(owner, 2026-10-27). Its `seasons` lists its result in each covered state,
and its other fields are the state's that comes first in the sort. Dates, a
stage or a status keep it when any state's result passes. Elsewhere,
`seasons` is `null`. The site does not show a species' other states yet.

Text with a place or dates keeps the species whose names contain it. Text
that is a ZIP code matches nothing: the result is `{ zip: true }`, and ZIP
code lookup stays with `zipCounties()`. Search reads only the published
files, through the release's reader, and never sends the text anywhere. It
loads from `@openphenology/api/search` when first called.

### A county map

```ts
const outlines = await release.boundaries("us-oh");
// outlines.data is GeoJSON, ready for any map library. With MapLibre:
map.addSource("counties", { type: "geojson", data: outlines?.data });
```

### Parks with a page

```ts
const parks = await release.places("parks");
for (const place of parks?.data.places ?? []) {
  if (place.park?.has_page) console.log(place.name, place.species_keys.length);
}
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

| Topic         | Methods                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Species       | `catalogue()`, `species(key)`, `speciesBySlug(slug)`, `groups()`, `searchNames()`                                                      |
| Search        | `search(input)`: species and places by name, and a place's species between two dates, by group, stage and status                       |
| Places        | `region(state)`, `boundaries(state)`, `cities(state)`, `zipCounties(zip)`, `places(kind)`, `placeBoundaries(kind)`                     |
| Results       | `stateResult(state, species)`, `countyResult(state, county, species)`, `nearby(state, county)`, `attribution(state, species, county?)` |
| Place results | `placeResult(area, species)`, `placeLabels(area)`, `placeAttribution(area, species)`                                                   |
| The release   | `manifest()`, `notes()`, `methods()`, `sources()`                                                                                      |

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

Branch on `error.code`, which stays the same across versions; messages may
change.

| Error         | `code`                                                                        |
| ------------- | ----------------------------------------------------------------------------- |
| `ApiError`    | `network`, `timeout`, `aborted`, `status`, `not-found`, `release-unavailable` |
| `FormatError` | `not-json`, `wrong-kind`, `unsupported-version`, `malformed`, `checksum`      |

```ts
import { ApiError, createClient } from "@openphenology/api";

try {
  await createClient({ release: "2026-10-19" }).release();
} catch (error) {
  if (error instanceof ApiError && error.code === "release-unavailable") {
    // the release was withdrawn: fall back to the current one
  }
}
```

## Citing the data

The data is licensed CC BY-NC 4.0, for noncommercial use. `client.terms()` says how to cite it, and
`release.attribution(...)` lists the sources behind each result.
`recordLinks(file)` gives the link to every record behind it, each to its
own observation or GBIF page, and `recordsCsv(file)` the same as a CSV file;
both are `null` for a sensitive species, whose records are credited by
dataset only.

## JSON Schemas

A JSON Schema for each file format is included, with every field described,
and a made-up example file for each one. Use them to check files with any
validator, or to see what a file looks like. `schemas/all-1.json` holds every
schema in one file, by kind:

```ts
import schema from "@openphenology/api/schemas/county-weekly-1.json" with { type: "json" };
import example from "@openphenology/api/schemas/examples/county-weekly-1.json" with { type: "json" };
```

## Use with AI assistants

[`@openphenology/mcp`](packages/mcp/README.md) is an MCP server that lets AI
assistants answer from the published data, with each answer's release,
limits and credit.
[Use with AI assistants](https://data.openphenology.com/ai-assistants)
explains how to add it.

> **Not live yet.** The hosted server runs on staging,
> `https://mcp-staging.openphenology.com`, behind access control, and opens
> at `https://mcp.openphenology.com` at launch. The package isn't on npm yet.

## Try it in Postman

[`postman/`](postman/README.md) has a Postman collection with a request for
every published file, each with a description, an example and tests. In
Postman, choose **Import** and paste
`https://raw.githubusercontent.com/openphenology/openphenology-api/main/postman/openphenology.postman_collection.json`.

## More

- [CHANGELOG.md](CHANGELOG.md): what changed in each version. Versions follow
  [Semantic Versioning](https://semver.org/); before 1.0.0, a breaking change
  bumps the minor version.
- [llms.txt](llms.txt): the whole package on one page, for AI coding agents.
  It ships in the package too.
- [CONTRIBUTING.md](CONTRIBUTING.md): working on the package.
- [SECURITY.md](SECURITY.md): reporting a security problem.
- Licence: [MIT](LICENSE).
