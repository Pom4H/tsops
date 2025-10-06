# tsops Architecture

This document explains how the tsops monorepo is organised today. It is meant to be machine-friendly (LLM agents) while still useful for humans.

## 1. High-Level View

```
┌───────────────────── CLI (`packages/cli`) ─────────────────────┐
│  Commander program `tsops`                                     │
│  • loads user config (tsops.config.*)                          │
│  • instantiates `TsOps` (from @tsops/core)                     │
│  • exposes commands: plan | build | deploy                     │
└──────────────────────────────┬─────────────────────────────────┘
                               │ options
                               ▼
┌────────────────────── Core Orchestrator (`TsOps`) ─────────────┐
│  wires dependencies once:                                      │
│   - ConfigResolver (project/namespaces/images/apps)            │
│   - Operations: Planner • Builder • Deployer                   │
│   - Adapters: Docker • Kubectl • CommandRunner • Logger        │
│   - Runtime config helpers (getEnv/getApp/…)                   │
└─────────────┬─────────────────────┬────────────────────────────┘
              │                     │
     ┌────────▼────────┐   ┌────────▼────────┐
     │ Planner.plan()  │   │ Builder.build() │   ...
     │ • resolve apps  │   │ • docker build  │
     │ • merge context │   │ • push images   │
     └────────┬────────┘   └────────┬────────┘
              │                     │
      ┌───────▼────────┐   ┌────────▼─────────┐
      │ Deployer.deploy│   │ Deployer.plan…   │
      │ • `planWithChanges` (diff)             │
      │ • namespace secrets/configMaps checks │
      │ • manifest batches via ManifestBuilder│
      │ • orphan cleanup through Kubectl      │
      └───────────────────────────────────────┘
```

## 2. Packages at a Glance

| Package | Purpose | Entry Point |
| --- | --- | --- |
| `packages/cli` (`tsops`) | Commander CLI. Wraps TsOps and provides UX, diff formatting, Git-aware env provider. | `src/index.ts` |
| `packages/core` (`@tsops/core`) | Configuration resolvers, runtime helpers, Docker/Kubectl adapters, Planner/Builder/Deployer. | `src/tsops.ts` |
| `packages/k8` (`@tsops/k8`) | Manifest builders for Deployments, Services, Ingress, Traefik IngressRoute, Certificates. | `src/manifest-builder.ts` |
| `tests` | Vitest suite verifying runtime helpers, config inference. | `config.test.ts` |

The monorepo is managed with **pnpm workspaces + Turborepo** (`turbo.json`). Global scripts such as `pnpm build`, `pnpm lint`, and `pnpm test` map to `turbo run <task>` across packages.

## 3. Config & Resolver Layer

`createConfigResolver(config, { env })` composes specialised resolvers. Each resolver is a pure abstraction so the rest of the system stays declarative.

- **ProjectResolver** — naming helpers (`${project}-${app}`), service names.
- **NamespaceResolver** — namespace iteration/filtering, helper context creation (exposes `serviceDNS`, `label`, `resource`, `secret`, `configMap`, `env`, `template`, namespace vars, cluster metadata).
- **ImagesResolver** — builds deterministic image refs. Supports strategies: `'git-sha' | 'git-tag' | 'timestamp' | string | { kind: string; … }`. Decorated with `GitEnvironmentProvider(ProcessEnvironmentProvider)` so Git metadata is available by default.
- **AppsResolver** — resolves app definitions per namespace: build info, env (with Secret/ConfigMap refs), secrets/configMaps data, network configuration. Delegates to `network-normalizers.ts` to materialise ingress/Traefik/cert manifests and to `images` resolver for defaults.

`defineConfig` (in `config/definer.ts`) reuses the same resolver stack lazily to provide runtime helpers (`getEnv`, `getApp`, `getInternalEndpoint`, `getExternalEndpoint`, `getNamespace`). Runtime resolution respects `TSOPS_NAMESPACE` or defaults to the first namespace.

## 4. Operations Layer

### Planner (`operations/planner.ts`)
- Selects namespaces/apps respecting `deploy` filters (`'all'`, allow/deny lists).
- Builds plan entries containing env, secrets, configMaps, network, ports, volumes and image references.

### Builder (`operations/builder.ts`)
- For each selected app, runs Docker builds/pushes (unless `dryRun`).
- Uses image resolver to compute registry repo/tag (optionally includes project prefix).

### Deployer (`operations/deployer.ts`)
- Central entry for `deploy()` and `planWithChanges()`.
- `deploy()` batches manifests:
  1. Ensure namespace (idempotent).
  2. Validate secrets (checks for placeholders/missing env values, reuses cluster secrets when possible).
  3. Apply secrets/configMaps atomically.
  4. Build full manifest set via `@tsops/k8` and apply as a batch.
  5. Detect and delete orphaned resources labelled `tsops/managed=true` but absent from plan.
- `planWithChanges()` reuses the planner, but instead of applying it:
  - Generates dry manifest objects for namespaces/secrets/configMaps/apps.
  - Asks Kubectl adapter to diff (client-side unless namespace already exists).
  - Produces a structured summary used by the CLI to display global/app/orphan sections.

## 5. Adapter & Infrastructure Layer

- **CommandRunner / DefaultCommandRunner** — thin wrapper over `child_process` allowing injection/mocking.
- **Logger / ConsoleLogger** — simple interface for structured logs (used mostly by Builder/Deployer, CLI adds its own formatting).
- **EnvironmentProvider hierarchy** — `ProcessEnvironmentProvider` ⟶ `GitEnvironmentProvider` ensures Git data exists when tag strategy needs it.
- **Docker Adapter** — executes `docker build`/`docker push`, honours `dryRun`.
- **Kubectl Adapter** — applies, diffs, deletes Kubernetes manifests. Provides helpers like `applyBatch`, `planManifest`, `delete`, `getSecretData` (used during secret validation).

## 6. Manifest Generation (`@tsops/k8`)

`ManifestBuilder.build(appName, context)` returns:
- Deployment manifest (with envFrom/valueFrom expansions, volumes, args, annotations, probes TBD).
- Service manifest (ports as declared in app config).
- Optional Ingress manifest (default HTTP/TLS).
- Optional Traefik IngressRoute manifest when custom routing is defined.
- Optional Certificate manifest (cert-manager) when TLS requested.

Individual builders live under `packages/k8/src/builders/` and are side-effect free. Utilities in `packages/k8/src/utils.ts` handle label/name generation consistent with project resolver.

## 7. Data Flows

### CLI `plan`
1. CLI parses flags → loads config via dynamic `import()` + extension search; throws actionable errors when TypeScript module cannot load without transpilation.
2. Instantiate `TsOps(config, { dryRun?, env: GitEnvironmentProvider(ProcessEnvironmentProvider) })`.
3. Call `tsops.planWithChanges(filters)`.
4. Deployer builds plan, validates global artifacts once, calls Kubectl to diff.
5. CLI groups output: Global Resources (namespaces / secrets / configMaps), Application Resources (create/update/unchanged/errors), Orphaned resources scheduled for deletion. Exits non-zero if validation failed.

### CLI `deploy`
1. CLI resolves config and flags (same as `plan`).
2. `tsops.deploy(filters)` obtains plan from Planner.
3. Deployer iterates plan entries (namespace/app) and performs the batching steps above.
4. Returns applied manifest references + deleted orphans. CLI prints summary; warnings emitted if secrets used cluster fallbacks.

### Runtime helpers
1. Application code `import config from './tsops.config.js'` (compiled to ESM).
2. `config.getEnv('api')` triggers lazy runtime config creation for the current namespace, reusing resolvers to evaluate env/secrets/configMaps/network.
3. Helpers cache until `TSOPS_NAMESPACE` changes.

## 8. Versioning & Release Notes

- Source of truth: `CHANGELOG.md` (Keep a Changelog format). Latest release `tsops` 1.2.0 / `@tsops/core` 0.3.0 (2025‑10‑06) introduced `planWithChanges`, secret docs refresh, runtime helper tests.
- Release process uses Changesets: run `pnpm changeset`, `pnpm changeset:version`, `pnpm release:publish` (builds all packages, publishes with `--no-git-checks`).
- Workspace protocol is `workspace:*`; ensure internal versions remain compatible before publishing.

## 9. Design Principles Recap

- **Dependency Injection everywhere** (constructors take interfaces, enabling deterministic tests and alternative adapters).
- **Pure data transformations** in resolvers/manifest builders (no IO).
- **Diff-first UX**: plan before deploy, detect drifts, clean orphans.
- **Runtime reuse of config**: same TypeScript definition powers deployment and app runtime env.
- **LLM-friendly layout**: short files, clear naming, rich documentation in `docs/` with consistent stories.

## 10. Useful Links

- CLI implementation: `packages/cli/src/index.ts`
- TsOps orchestrator: `packages/core/src/tsops.ts`
- Resolvers: `packages/core/src/config/`
- Operations: `packages/core/src/operations/`
- Runtime helpers: `packages/core/src/config/definer.ts`
- Manifest builder: `packages/k8/src/manifest-builder.ts`
- Docs homepage: `docs/index.md`
- Comprehensive config test: `tests/config.test.ts`

Stay aligned with this document when introducing new operations, resolvers, or adapters—update the relevant sections as part of feature PRs.
