# Agent guide

`@openphenology/api` is a TypeScript client for OpenPhenology's published
data. [CONTRIBUTING.md](CONTRIBUTING.md) is the full guide; this is the short
version.

## Set up

```sh
corepack enable
pnpm install
```

In a Claude Code cloud session, `.claude/setup.sh` does this for you and sets
`CHROMIUM_PATH`.

## Check your work

- `pnpm check` runs everything CI runs. It needs Chromium, Firefox and WebKit.
- Without those browsers, run `pnpm check:node`, then, if `CHROMIUM_PATH` is
  set, `pnpm exec vitest run --project 'browser (chromium)'`. Say which checks
  you could not run.

## Don't edit by hand

- `schemas/*.json` and `schemas/examples/*.json`: run `pnpm schemas`.
- `dist/` and `docs/`: built by `pnpm build` and `pnpm docs:build`.

## Rules

- `src` uses only web-standard APIs and has no runtime dependencies. The built
  code stays under 5 KB gzipped (`pnpm size`).
- Every export has a doc comment with `@param`, `@returns` and `@throws`.
- Field docs live in `src/types.ts`; the schemas copy them.
- Tests use the made-up release in `test/fixture.ts` and never touch the
  network.
- Keep `README.md` and `llms.txt` in step with the API, and add user-visible
  changes under Unreleased in `CHANGELOG.md`.
- One change per pull request.
