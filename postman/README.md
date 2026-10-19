# OpenPhenology in Postman

**Beta.** OpenPhenology is in beta: requests may change before 1.0.0, while
published file formats change only by version.

`openphenology.postman_collection.json` has one request for every kind of file
OpenPhenology publishes. Each request has a description of the file, a made-up
example response, and tests. No keys or accounts are needed. The collection is
generated from this package by `pnpm postman`; don't edit it by hand.

## Import it

In Postman, choose **Import** and paste this link:

```text
https://raw.githubusercontent.com/openphenology/openphenology-api/main/postman/openphenology.postman_collection.json
```

## Run it

Send **1. Start here › Current release** first. It saves the current release
into `{{release}}`. Then run the collection, or any folder, from the top:
**Catalogue** and **Region** save a species with results into `{{species}}`, and
**Place labels** saves one into `{{placeSpecies}}`, so nothing needs typing.

## Variables

Set these on the collection's **Variables** tab.

| Variable       | Starts as                       | What it is                                                |
| -------------- | ------------------------------- | --------------------------------------------------------- |
| `baseUrl`      | `https://api.openphenology.com` | The API                                                   |
| `release`      | `2026-10-19`                    | A release ID, its date; saved by Start here               |
| `state`        | `us-oh`                         | A state: `us-` and the postal abbreviation                |
| `county`       | `39049`                         | A county's 5-digit Census code (GEOID)                    |
| `species`      | `example-species`               | A species key; saved by Catalogue and Region              |
| `zip`          | `43215`                         | A ZIP code; ZIP codes reads its 3-digit group             |
| `placeKind`    | `parks`                         | `watersheds`, `ecoregions` or `parks`                     |
| `place`        | `parks-cleveland-metroparks`    | A place's area code: `huc8-`, `eco-`, `park-` or `parks-` |
| `placeSpecies` | `example-species`               | A species with a result in `place`; saved by Place labels |

## What the tests check

Each request checks that its file loads, is the expected kind and major format
version, and matches its JSON Schema, read from the release's `schemas/`
folder. A large file may be published as shards (`<name>/0.json`,
`<name>/1.json` and so on); the test then checks shard 0.

A 404 means the file isn't published: that species, county or state has no
such file in this release.

## From the command line

[Newman](https://www.npmjs.com/package/newman) runs the same collection:

```sh
npx newman run https://raw.githubusercontent.com/openphenology/openphenology-api/main/postman/openphenology.postman_collection.json
```

The data is licensed CC BY-NC 4.0, for noncommercial use. **1. Start here › Terms** says how to cite it.
