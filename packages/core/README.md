# @tsops/core

Typed application graph, configuration resolvers, and delivery operations for tsops.

Most applications should install the `tsops` package, which re-exports `defineConfig` and provides the CLI. Use `@tsops/core` directly when building an integration with custom external-effect adapters.

## Responsibilities

- preserve literal project, namespace, application, Secret, and ConfigMap keys;
- resolve static and overlay namespaces;
- provide runtime-aware endpoint and resource helpers;
- validate dependency graphs and produce deterministic deploy order;
- plan application and namespace resources;
- select and describe Docker image builds;
- orchestrate Kubernetes apply, diff, lifecycle hooks, and managed-orphan cleanup through ports;
- validate sensitive environment configuration;
- expose structured results before CLI formatting.

## Boundary

`@tsops/core` contains domain behavior and interfaces. It must not directly invoke Node.js processes, Git, Docker, registries, filesystems, or `kubectl`.

Standard implementations live in `@tsops/node`:

```ts
import config from './tsops.config.js'
import { createNodeTsOps } from '@tsops/node'

const tsops = createNodeTsOps(config, { dryRun: true })
const plan = await tsops.planWithChanges({ namespace: 'production' })
```

Custom integrations can instantiate the core orchestrator with their own ports and logger.

## Major modules

```text
src/config/       defineConfig and typed resolvers
src/network/      port normalization and endpoint semantics
src/graph/        dependency validation and topological ordering
src/operations/   planner, builder, deployer, overlay lifecycle
src/ports/        Docker, kubectl, command, and related contracts
src/validation/   deterministic safety checks
src/tsops.ts      composed programmatic API
```

The exact module layout may evolve; domain rules should remain independently testable.

## Runtime contract

The object returned by `defineConfig` exposes helpers such as:

```ts
config.url('api', 'service')
config.url('api', 'cluster')
config.url('api', 'ingress')
config.dns('api', 'service')
config.servicePort('api')
config.targetPort('api')
config.listenPort('api')
```

`TSOPS_NAMESPACE` chooses the active namespace. A local `TSOPS_DEV_URLS` map, created by `tsops dev`, supplies stable Portless routes without changing application keys.

## Design invariants

- Equal graph inputs produce equal names, manifests, endpoints, and selection results.
- Invalid overlay variables fail before external mutations.
- Secrets remain references and never appear in diagnostic output.
- Deploy-time image overrides are immutable digest references.
- Domain operations return data; presentation belongs to callers.
- New workflows must not require a parallel application topology file.

## Development

From the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm docs:build
```

Read the root [`ARCHITECTURE.md`](../../ARCHITECTURE.md) before changing package boundaries and [`AGENTS.md`](../../AGENTS.md) before agent-assisted work.
