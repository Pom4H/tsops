# Contributing to tsops

Thanks for taking the time to contribute!

## Workflow
- Fork and create a feature branch from `main`.
- Install deps: `pnpm install`.
- Build packages: `pnpm build`.
- Add tests: unit (Vitest) and type tests if you change public types.
- Lint: `pnpm lint`.
- Commit with clear messages, open a PR.

## Development
- Docs dev server: `pnpm docs:dev`.
- Run tests: `pnpm test`.

## API Consistency Checklist
Use this checklist during PR review:

- Naming
  - Methods are verbs (`getEnv`, `getApp`); options/values are nouns.
  - Option keys are consistent: `protocol`, `port`, `clusterDomain`.

- Signatures
  - Options object is last; numeric shorthand allowed where applicable (e.g., `serviceDNS('api', 3000)`).
  - Avoid overloads that reduce IntelliSense. Prefer a single options object.
  - Return `undefined` for missing optional values, not magic defaults (exception: `env()` documented behavior).

- Type Safety
  - Keys (apps/secrets/configMaps) are inferred from config; no widening to `string`.
  - No `any` in public types.
  - Add type tests for: `defineConfig`, `getApp`, `serviceDNS`, `secret/configMap`.

- Errors
  - `get*` methods throw clear errors; prefer consistent messages and structure.

- Helpers Behavior
  - `serviceDNS` default: no protocol; options add `scheme://`.
  - `secret`/`configMap` unify envFrom/valueFrom.
  - `template` replaces `{key}` with empty string if missing.
  - `env(key, fallback?)` returns `process.env[key]` or `fallback` or empty string.

- Runtime API
  - Expose only: `getApp`, `getEnv`, `getInternalEndpoint`, `getExternalEndpoint`, `getNamespace`.
  - `getExternalEndpoint` derives from `network`.

- CI
  - ESLint passes; Vitest passes.
  - Type tests (tsd) pass for changed types.

## Releasing
- Follow SemVer.
- Update `CHANGELOG.md` with changes.
- Tag the release.

## Code of Conduct
Be respectful and inclusive. Harassment or discrimination is not tolerated.
