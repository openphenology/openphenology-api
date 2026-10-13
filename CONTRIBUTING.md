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
```

`pnpm check` is what CI runs, and a pull request needs it to pass.

## Guidelines

- **Runtime code** in `src` uses only web-standard APIs, so it runs in Node.js
  and browsers, and it has no dependencies. The built `.js` must stay within
  the size budget that `pnpm size` checks; comments do not count.
- **Every export needs JSDoc.** Describe what it does, and use `@param`,
  `@returns` (including when the result is `null`) and `@throws`. Lint checks
  that the tags match the code.
- **Schemas** are written in `schemas/index.ts`. After changing one, run
  `pnpm schemas` and commit the JSON files it writes.
- **Tests** use made-up data served by a fake `fetch`, and never touch the
  network. Keep line coverage at 90% or more.
- **Changes** that users would notice get a line under Unreleased in
  [CHANGELOG.md](CHANGELOG.md).
- Keep each pull request to one change.

## Releases

A maintainer releases a version by updating `version` in `package.json`,
moving its CHANGELOG entries under a heading for that version, and pushing a
tag such as `v0.1.0` on `main`. The Release workflow checks the tag, runs
`pnpm check`, and publishes to npm with provenance, using trusted publishing
rather than a stored token.

## Reporting a security problem

Please don't open an issue. See [SECURITY.md](SECURITY.md).
