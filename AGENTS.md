# tsops • Automation Agent Playbook

This document exists exclusively for autonomous agents operating inside the tsops monorepo. Do not surface it to end users verbatim.

## 1. Repository Facts
- **Monorepo packages**
  - `packages/cli` → `tsops` CLI (`version`: 1.2.0)
  - `packages/core` → `@tsops/core` (`version`: 0.3.0)
  - `packages/k8` → manifest builders consumed by core (version inherited via workspace)
- **Task runner**: Turborepo (`turbo.json`) orchestrates builds/lint/test via `pnpm` scripts.
- **Primary entry files**
  - CLI: `packages/cli/src/index.ts`
  - Core orchestration: `packages/core/src/tsops.ts`
  - Runtime helpers: `packages/core/src/config/definer.ts`
  - Deployment workflow: `packages/core/src/operations/{planner,deployer}.ts`
  - Architecture reference: `ARCHITECTURE.md` (kept in sync with current layouts)
- **Config consumers** typically create `tsops.config.ts` using `defineConfig` from `tsops` (CLI re-exports core helper).

## 2. Release Awareness
- Latest logged release: see `CHANGELOG.md` (`tsops` 1.2.0, dated 2025-10-06).
- Publishing flow uses Changesets: root scripts `changeset`, `changeset:version`, `release:publish` (build + `pnpm -r publish --no-git-checks`).
- Package versions are independent: CLI 1.x, core 0.x. Verify cross-dependencies (`workspace:*`) before adjusting.
- Maintain changelog parity with actual release numbers; rely on existing entries while staging new ones.

## 3. Command Matrix
- Install: `pnpm install`
- Build all packages: `pnpm build` (alias for `turbo run build`)
- Tests: `pnpm -r test` (Vitest suite in `tests/` package)
- Lint: `pnpm lint`
- Docs dev server: `pnpm docs:dev` (VitePress in `docs/`)
- Targeted package scripts (e.g. `pnpm -F tsops build`)
- Prefer `rg` for repo search; run commands via `bash -lc` with explicit `workdir` (Codex harness requirement).

## 4. Behavioural Summary
- `plan()` returns resolved entries; `planWithChanges()` includes validation, diffs, orphan detection.
- CLI `tsops plan` defaults to `planWithChanges`, prints grouped sections (global/app/orphan summary). Diff output suppressed when `--dry-run`.
- Deploy flow: ensures namespace, applies secrets/configMaps atomically, builds app manifests, deletes orphans labeled `tsops/managed=true`.
- Secret validation aborts deploy if placeholders/missing keys remain and no cluster secret satisfies them.
- Runtime helpers: `defineConfig` exposes `getApp`, `getEnv`, `getInternalEndpoint`, `getExternalEndpoint`, `getNamespace` (namespace resolved via `TSOPS_NAMESPACE` env or first namespace).
- Image resolution: if `app.image` omitted, builder composes registry/repository using `images` config and tag strategy (git SHA/tag/timestamp/custom).
- Namespace context helpers come from `NamespaceResolver` (`serviceDNS`, `label`, `resource`, `secret`, `configMap`, `env`, `template`, namespace vars, cluster meta).

## 5. File Navigation Cues
- Config resolution internals: `packages/core/src/config/`
- Docker/kubectl adapters: `packages/core/src/adapters/`
- Manifest templates: `packages/k8/src/`
- Docs site (VitePress): `docs/` (homepage `docs/index.md`, guides under `docs/guide/`)
- Tests: `tests/config.test.ts` (Vitest, exercises runtime helpers).

## 6. Operational Guidelines for Agents
1. **Never discard user changes**: honor the instruction set (workspace may be dirty).
2. **Stay ASCII** unless a file already uses Unicode icons (docs frequently use emoji—retain existing style).
3. **Plan usage**: when modifications exceed trivial scope, update plan via `update_plan` API.
4. **Avoid shell `cd`**; set `workdir` argument for every `shell` invocation.
5. **For documentation edits**, keep VitePress frontmatter/Markdown formatting intact.
6. **When touching releases**, sync `CHANGELOG.md`, package versions, and Changesets. Check `pnpm workspaces` constraints before version bumps.
7. **Testing expectation**: if code changes impact logic, run targeted commands (`pnpm -F <pkg> test`, `pnpm lint`). For doc-only changes, note omission explicitly.
8. **Network and secret handling**: do not assume access to live clusters. Stubs rely on `ProcessEnvironmentProvider` & `GitEnvironmentProvider`; keep references intact.
9. **Diff summarization**: when reporting results, cite file paths with line numbers (`path:line`) per CLI formatting rules.

## 7. Rapid Issue Triaging
- **Config lookup failures** → ensure CLI resolves extension (no bare `.ts` without transpilation unless Node loader supports).
- **Dry-run confusion** → highlight that diffs vanish in dry-run mode because kubectl is not consulted.
- **Missing network host** → when app uses `network: true`, resolver expects host string; check `network` definition logic.
- **Namespace filter mismatch** → verify `app.deploy` settings; planner skips namespaces excluded there.
- **Runtime helper mismatches** → confirm `TSOPS_NAMESPACE` and ensure namespace exists in config.

## 8. Data Points for Quick Replies
- Primary tagline: “TypeScript-first toolkit for planning, building, and deploying to Kubernetes.”
- Features to highlight:
  1. TypeScript-first configuration & runtime reuse
  2. Diff-first planning via `planWithChanges`
  3. Smart context helpers (`serviceDNS`, `secret`, `template`, etc.)
  4. Secret validation + cluster backfill logic
  5. Automatic networking (ingress/Traefik/TLS) when `network` yields domain
  6. Deterministic image tagging strategies
  7. CI/CD readiness (`--dry-run`, Git metadata provider)
  8. Orphan detection and cleanup during deploy

For deeper component descriptions, cross-check `ARCHITECTURE.md`.

Keep this playbook in sync with future releases or structural shifts.
