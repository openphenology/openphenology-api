# Contributing

Thanks for helping. Bug reports and pull requests are welcome.

## Getting set up

You need Node.js 24 (the version in `.node-version`) and Git.

1. Clone the repository and install:

   ```sh
   git clone https://github.com/openphenology/openphenology-api.git
   cd openphenology-api
   corepack enable   # provides the pnpm version this repo pins
   pnpm install
   ```

2. Install the test browsers (once):

   ```sh
   pnpm exec playwright install chromium firefox webkit
   ```

3. Run every check, as CI does:

   ```sh
   pnpm check
   ```

If that passes, you're ready to make changes.

## Useful commands

| Command           | What it does                                                                           |
| ----------------- | -------------------------------------------------------------------------------------- |
| `pnpm check`      | Everything CI runs. A pull request needs it to pass                                    |
| `pnpm test`       | Tests in Node.js, then in Chromium, Firefox and WebKit                                 |
| `pnpm format`     | Fixes formatting                                                                       |
| `pnpm schemas`    | Rewrites the schemas and their examples                                                |
| `pnpm docs:build` | Builds the API reference into `docs/`: open `docs/index.html`, or read `docs/api.json` |

## Where things are

| Path       | Holds                                                        |
| ---------- | ------------------------------------------------------------ |
| `src/`     | The package: `client.ts` reads files, `types.ts` shapes them |
| `schemas/` | The JSON Schemas, written in `index.ts`                      |
| `test/`    | Tests, with a made-up release in `fixture.ts`                |
| `scripts/` | The schema writer and the size check                         |

## Guidelines

- **Runtime code** in `src` uses only web-standard APIs and no dependencies,
  so it runs in Node.js and browsers. `pnpm size` keeps the built code under
  5 KB gzipped; comments don't count.
- **Every export needs a doc comment.** Describe what it does, and use
  `@param`, `@returns` (including when the result is `null`) and `@throws`.
  Lint checks that the tags match the code, and `pnpm check` fails when
  TypeDoc finds an undocumented export or a broken link.
- **Schemas** are written in `schemas/index.ts`. Their field descriptions
  come from the doc comments in `src/types.ts`, and their examples from the
  made-up release in `test/fixture.ts`. After changing any of these, run
  `pnpm schemas` and commit the JSON files it writes.
- **Tests** use made-up data served by a fake `fetch`, and never touch the
  network. Keep line coverage at 90% or more.
- **`llms.txt`** summarises the package for AI agents. Update it with any
  API change; `pnpm check` fails when it misses a public method.
- **Changes** that users would notice get a line under Unreleased in
  [CHANGELOG.md](CHANGELOG.md).
- Keep each pull request to one change.

## Releases

A maintainer sets `version` in `package.json`, moves the CHANGELOG's
Unreleased entries under that version, and pushes a tag such as `v0.1.0` on
`main`. The Release workflow then checks and publishes the package to npm.

## Reporting a security problem

Please don't open an issue. See [SECURITY.md](SECURITY.md).
