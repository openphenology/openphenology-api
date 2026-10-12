# Changelog

All notable changes to this package are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Client that reads the current or a pinned release: species, state summaries,
  and state and county results.
- Optional SHA-256 checks against the release manifest.
- Timeouts, retries, and `ApiError` and `FormatError` errors.
- TypeScript types for the published files.
