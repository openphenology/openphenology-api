# openphenology-api

Read OpenPhenology data.

Not yet released. The reading API is under development.

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
pnpm check    # formatting, lint, typecheck, tests in Node.js and browsers, build
pnpm format   # fix formatting
```

## Licence

[MIT](LICENSE)
