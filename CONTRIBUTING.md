# Contributing

Thanks for helping. Bug reports and pull requests are welcome.

## Setting up

Needs Node.js 24 and pnpm (`corepack enable`).

```sh
pnpm install
pnpm exec playwright install chromium firefox webkit   # test browsers
```

## Checking a change

```sh
pnpm check    # formatting, schemas, lint, typecheck, tests in Node.js and browsers, build, size
pnpm format   # fix formatting
pnpm schemas  # write schemas/*.json from schemas/index.ts
pnpm docs     # build the API reference into docs/ with TypeDoc
```

`pnpm check` is what CI runs, and a pull request needs it to pass.

## Guidelines

- **Runtime code** in `src` uses only web-standard APIs and no dependencies,
  so it runs in Node.js and browsers. `pnpm size` keeps the built code under
  5 KB gzipped; comments don't count.
- **Every export needs a doc comment.** Describe what it does, and use
  `@param`, `@returns` (including when the result is `null`) and `@throws`.
  Lint checks that the tags match the code, and `pnpm check` fails when
  TypeDoc finds an undocumented export or a broken link.
- **Schemas** are written in `schemas/index.ts`. After changing one, run
  `pnpm schemas` and commit the JSON files it writes.
- **Tests** use made-up data served by a fake `fetch`, and never touch the
  network. Keep line coverage at 90% or more.
- **Changes** that users would notice get a line under Unreleased in
  [CHANGELOG.md](CHANGELOG.md).
- Keep each pull request to one change.

## Releases

A maintainer sets `version` in `package.json`, moves the CHANGELOG's
Unreleased entries under that version, and pushes a tag such as `v0.1.0` on
`main`. The Release workflow then checks and publishes the package to npm.

## Reporting a security problem

Please don't open an issue. See [SECURITY.md](SECURITY.md).
