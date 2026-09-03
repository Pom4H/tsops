# tsops architecture

This document describes the repository as of **tsops 2.1**. It is written for maintainers and coding agents; public product concepts live in [`docs/guide/what-is-tsops.md`](docs/guide/what-is-tsops.md).

## Product boundary

tsops owns the **containerized application graph** of a TypeScript monorepo:

- application identity and dependencies;
- build contexts, inputs, image naming, and immutable handoff;
- namespace runtime and endpoint resolution;
- Kubernetes workload generation, planning, and application;
- local process topology;
- parameterized preview environments and their lifecycle policy.

It does not provision clusters, cloud accounts, networks, or arbitrary provider resources. Those are upstream infrastructure concerns.

## Repository map

```text
.
├── packages/
│   ├── core/       typed domain model, resolvers, operations, ports
│   ├── node/       Node.js implementations for Git, Docker, kubectl, commands
│   ├── k8/         pure Kubernetes manifest builders and resource types
│   └── cli/        published `tsops` package and command-line UX
├── tests/           cross-package behavior and type-focused tests
├── examples/        maintained application-graph fixtures
├── docs/            VitePress documentation
├── tsops.config.ts  repository fixture
└── .changeset/      release intent
```

The workspace uses pnpm and Turborepo. TypeScript 6 is compiled through project references; Biome owns repository linting and formatting.

## Dependency direction

```text
@tsops/k8  <──  @tsops/core  <──  @tsops/node  <──  tsops CLI
                      ▲
                      └──────── public defineConfig/runtime API
```

`core` may depend on Kubernetes data types and pure builders, but it must not depend on Node.js process, filesystem, Docker, or `kubectl` implementations. External effects enter through ports and are wired by `@tsops/node`.

The CLI owns presentation and process exit behavior. It must not become the only place where a domain rule exists.

## The configuration contract

`defineConfig` preserves literal application and namespace keys while constructing the resolver stack lazily. The same returned object exposes runtime helpers such as:

```ts
config.url('api', 'service')
config.url('api', 'cluster')
config.url('api', 'ingress')
config.dns('api', 'service')
config.servicePort('api')
config.targetPort('api')
config.listenPort('api')
```

Application configuration callbacks receive namespace variables plus helpers for endpoints, Secrets, ConfigMaps, resource names, and environment lookup.

### Runtime shapes

A static namespace may declare:

- `runtime: 'local'` — endpoints resolve to the local process topology;
- `runtime: 'docker'` — endpoints resolve on a shared Docker network;
- `runtime: 'kubernetes'` — the default, using Services and cluster DNS.

`TSOPS_NAMESPACE` selects the active runtime. Under `tsops dev`, `TSOPS_DEV_URLS` supplies the complete Portless route map and takes precedence for service URL resolution.

### Overlay namespaces

An overlay definition is a template, not a long-lived namespace. It declares:

- `extends` — base namespace whose variables it inherits;
- `naming(vars)` and `domain(vars)` — resolved namespace and public host;
- `fallback` — base namespace for applications not deployed into the overlay;
- optional TLS, access, app-secret, namespace-policy, and database hooks;
- optional `validateVars` for fail-closed policy.

At runtime, `tsops up` materialises a static view that normal planning and deployment can consume.

## Command flows

### `tsops dev`

1. Load the config and select exactly one `runtime: 'local'` namespace, unless explicitly specified.
2. Select applications with local dev commands.
3. Resolve each command from `apps.<name>.dev` or the `dev` script under its build context.
4. Derive a deterministic Portless route from `{project, app}`.
5. Resolve all URLs before spawning children.
6. Start each process through `portless run` with shared `TSOPS_NAMESPACE` and `TSOPS_DEV_URLS`.
7. Forward termination signals and fail when a child exits unexpectedly.

Git-worktree isolation is delegated to Portless; tsops contributes the stable application route names and the complete typed topology.

### `tsops plan`

1. Resolve selected namespaces and applications.
2. Validate dependencies, Secrets, ConfigMaps, routes, images, and namespace policy.
3. Build deterministic namespace and application manifests.
4. ask the `KubectlClient` for per-resource diffs;
5. detect resources labelled as managed by tsops but absent from the desired graph;
6. return structured creates, updates, unchanged resources, errors, and orphans;
7. let the CLI format the result and choose an exit code.

Planning must never hide a validation failure behind presentation logic.

### `tsops build`

1. Select applications directly or from files changed against `--filter`.
2. Resolve image repository and tag strategy.
3. When source-key reuse is enabled, hash selected inputs plus build metadata.
4. Check whether that content-derived image already exists.
5. Reuse its immutable digest on an exact match, otherwise run the Docker build.
6. Apply optional BuildKit registry cache settings.
7. return both human-readable tags and immutable digest references when available.

Source-key reuse and BuildKit cache solve different problems: the former skips an exact build, while the latter accelerates a necessary build.

### `tsops deploy`

1. Resolve a plan for the target namespace and applications.
2. Validate optional digest overrides; unknown apps and mutable references fail before apply.
3. Ensure namespace-level resources.
4. Validate and apply Secrets and ConfigMaps.
5. Apply application manifests in dependency order.
6. Delete managed orphans.
7. return every applied and deleted resource reference.

Dependency order is topological, but tsops does not currently wait for each application to become ready before applying dependants.

### `tsops up`

1. Validate overlay variables before cluster mutation.
2. Resolve the overlay namespace and selected application set.
3. Render namespace policy.
4. Run TLS, access, database, and app-secret preparation in contract order.
5. Deploy included applications.
6. Render `ExternalName` fallback Services for excluded dependencies.
7. Return the resolved preview topology.

`--apps-from-changes` reuses Git and build-context knowledge so preview selection does not require a second ownership map.

### `tsops down`

1. Resolve the same overlay identity from runtime variables.
2. Run post-destroy database cleanup unless explicitly retained.
3. Delete the namespace.
4. Report cleanup failures without pretending the environment is gone.

## Core modules

### Configuration resolvers

Resolvers turn the generic config into deterministic names, applications, builds, environments, endpoints, Secrets, ConfigMaps, and namespace metadata. They should be pure for a fixed environment provider.

### Planner

The planner selects and topologically orders applications, expands configuration callbacks, and produces an operation-level graph independent of CLI formatting.

### Builder

The builder owns image selection and delegates registry inspection and Docker effects to adapters.

### Deployer

The deployer composes validation, manifest construction, diffing, apply, overlay hooks, and orphan cleanup. New cluster mutations must remain observable through returned data.

### Kubernetes builders

`@tsops/k8` contains side-effect-free builders for Deployments, Services, Ingress, Traefik IngressRoute and Middleware resources, Certificates, Jobs, quotas, limits, and related objects. Naming stays consistent with the project resolver.

### Node adapters

`@tsops/node` provides command execution, Git metadata and diff access, Docker/registry operations, and `kubectl` integration. Core behavior must be testable against fake ports without invoking these tools.

## Invariants

- Names derive deterministically from project, namespace, application, and explicit variables.
- Application keys remain literal through public helpers and dependency declarations.
- Secrets are modeled and referenced; unresolved or placeholder values block unsafe operations.
- Image promotion uses immutable digests at the deploy boundary.
- Local, Docker, and Kubernetes endpoints share one semantic lookup API.
- Overlay variable validation runs before side effects.
- Managed-resource cleanup is label-scoped and visible in the plan.
- Domain decisions return structured data before the CLI formats them.
- A new workflow must not require a second topology file.

## Testing and release

The required repository checks are:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm docs:build
```

Public behavior changes need tests, an updated example or guide, and a Changeset. Releases are produced from Changesets; package changelogs and versions are generated rather than edited ad hoc.

## Current architectural priorities

1. A stable machine-readable resolved graph for CI, IDEs, and agents.
2. Stronger readiness, retry, and structured-result semantics for preview lifecycle.
3. First-class build provenance and digest output.
4. Executable documentation and examples.

See [`ROADMAP.md`](ROADMAP.md) for the product rationale and explicit non-goals.
