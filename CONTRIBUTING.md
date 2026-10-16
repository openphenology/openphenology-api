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

   If you can't install them, as in many sandboxes, run `pnpm check:node`
   instead: every check except the browser tests. With a Chromium already
   installed, set `CHROMIUM_PATH` to its executable to run the browser tests
   in Chromium alone:

   ```sh
   CHROMIUM_PATH=/path/to/chrome pnpm exec vitest run --project 'browser (chromium)'
   ```

3. Run every check, as CI does:

   ```sh
   pnpm check
   ```

If that passes, you're ready to make changes.

## Useful commands

| Command           | What it does                                                                  |
| ----------------- | ----------------------------------------------------------------------------- |
| `pnpm check`      | Everything CI runs. A pull request needs it to pass                           |
| `pnpm check:node` | Everything except the browser tests, for machines without the browsers        |
| `pnpm test`       | Tests in Node.js, then in Chromium, Firefox and WebKit                        |
| `pnpm test:node`  | Tests in Node.js only, with coverage                                          |
| `pnpm format`     | Fixes formatting                                                              |
| `pnpm schemas`    | Rewrites the schemas and their examples                                       |
| `pnpm docs:build` | Builds the API reference into `docs/`: `docs/index.html`, and `docs/api.json` |

## Where things are

| Path                                   | Holds                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/client.ts`                        | The client: requests, releases and every read method                               |
| `src/types.ts`                         | The shape of every published file. Its comments document each field                |
| `src/errors.ts`                        | `ApiError`, `FormatError` and their codes                                          |
| `src/parse.ts`                         | The light checks run on every file                                                 |
| `schemas/index.ts`                     | The source of the JSON Schemas                                                     |
| `test/fixture.ts`                      | The made-up release every test reads, served by a fake `fetch`                     |
| `scripts/schemas.ts`                   | Writes the schemas and examples; `scripts/describe.ts` adds the field descriptions |
| `scripts/llms.ts`, `scripts/readme.ts` | Check that `llms.txt` and the README examples match the API                        |
| `scripts/size.mjs`                     | The size budget                                                                    |
| `README.md`, `llms.txt`                | Docs for people and for AI agents; keep both in step with the API                  |
| `packages/mcp`                         | `@openphenology/mcp`, an MCP server built on the client. Not yet published         |

**Generated; don't edit by hand:** `schemas/*.json` and
`schemas/examples/*.json` (run `pnpm schemas`), `dist/` (`pnpm build`) and
`docs/` (`pnpm docs:build`).

## Guidelines

The repository is a pnpm workspace. Its root is the client,
`@openphenology/api`; other packages built on it live under `packages/` and
depend on it with `workspace:*`. Run every command from the root:
`pnpm check` covers every package.

- **Runtime code** in `src` uses only web-standard APIs and no dependencies,
  so it runs in Node.js and browsers. `pnpm size` keeps the built code under
  5 KB gzipped; comments don't count. These two rules are for the client
  only: `packages/mcp` depends on the MCP SDK.
- **Every export needs a doc comment.** Describe what it does, and use
  `@param`, `@returns` (including when the result is `null`) and `@throws`.
  Lint checks that the tags match the code, and `pnpm check` fails when
  TypeDoc finds an undocumented export or a broken link, or when a README
  example no longer type-checks.
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
