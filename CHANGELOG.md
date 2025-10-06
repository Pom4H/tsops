# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog (https://keepachangelog.com/en/1.0.0/),
and this project adheres to Semantic Versioning (https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2025-10-06
### Added
- Tests: Vitest v3 setup and comprehensive config test (`tests/config.test.ts`).
- CONTRIBUTING guide with API consistency checklist.
- Docs: two-app example on the homepage (`docs/index.md`).

### Changed
- Type inference: `getApp(appName)` now narrows `appName` to `keyof apps` via generics fix.
- `serviceDNS` docs clarified: default without protocol; options add `scheme://`.
- Documentation updated to recommend `network` for external host.

### Deprecated
- `host` in app definitions (use `network`). Temporary compatibility may remain.

### Fixed
- ESLint parser config for tests via tests tsconfig (docs only).

## [0.1.0] - 2025-10-06
### Added
- Initial public APIs: `defineConfig`, runtime helpers, resolvers, k8s builders.
