# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog (https://keepachangelog.com/en/1.0.0/),
and this project adheres to Semantic Versioning (https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Published a dedicated `tsops/cli` entry point so command-line tooling can keep using Node built-ins without affecting bundlers.
- Added the `@tsops/core/config` export for consumers who need direct access to `defineConfig` without touching Node-specific modules.
- Introduced the `@tsops/node` package with Node-only adapters (`Docker`, `Kubectl`, `DefaultCommandRunner`, `ProcessEnvironmentProvider`, `GitEnvironmentProvider`) and a `createNodeTsOps` factory.

### Changed
- The top-level `tsops` export now provides `defineConfig` directly without importing `node:fs`, so `npm install tsops` is enough for both config helpers and the CLI.
- `@tsops/core` no longer ships Node-bound implementations; `TsOps` now expects injected `DockerClient`/`KubectlClient` ports so configs stay platform-neutral.

### Fixed
- Documentation and starter configs now avoid using helper callbacks inside root-level `secrets`/`configMaps`, removing the confusing `env` typing issues those helpers triggered.

## [1.2.1] - 2025-10-07
### Fixed
- Type exports: `defineConfig` now returns the public `TsOpsConfigWithRuntime` shape so external projects avoid `.pnpm` path references.

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
