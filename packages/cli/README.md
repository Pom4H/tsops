# tsops

**One typed application graph from localhost to Kubernetes.**

tsops is an application delivery toolkit for TypeScript monorepos. A single `tsops.config.ts` drives local processes, affected container builds, Kubernetes plans and deploys, selective pull-request environments, and runtime service discovery.

## Requirements

- Node.js 24+
- Docker for image builds
- `kubectl` for Kubernetes plan and deploy
- Portless for `tsops dev`

## Install

```bash
pnpm add -D tsops portless
```

Portless is optional when local process orchestration is not used.

## Minimal configuration

```ts
// tsops.config.ts
import { defineConfig } from 'tsops'

const config = defineConfig({
  project: 'orchard',

  namespaces: {
    local: {
      runtime: 'local',
      domain: 'orchard.localhost'
    },
    production: {
      runtime: 'kubernetes',
      domain: 'orchard.example.com'
    }
  },

  clusters: {
    production: {
      apiServer: 'https://kubernetes.example.com:6443',
      context: 'production',
      namespaces: ['production']
    }
  },

  images: {
    registry: 'ghcr.io/acme/orchard',
    tagStrategy: 'git-sha'
  },

  apps: {
    api: {
      build: {
        type: 'dockerfile',
        context: 'apps/api',
        dockerfile: 'apps/api/Dockerfile',
        inputs: ['apps/api/**', 'packages/shared/**', 'pnpm-lock.yaml'],
        sourceKey: true,
        cache: { type: 'registry', mode: 'max' }
      },
      ports: [{ name: 'http', port: 80, targetPort: 3000 }]
    },

    web: {
      build: {
        type: 'dockerfile',
        context: 'apps/web',
        dockerfile: 'apps/web/Dockerfile'
      },
      needs: ['api'],
      ingress: ({ domain }) => ({ domain }),
      ports: [{ name: 'http', port: 80, targetPort: 3000 }]
    }
  }
})

export default config
```

Application code can import the same contract:

```ts
import config from '../../tsops.config.js'

const apiUrl = config.url('api', 'service')
```

## Commands

| Command | Purpose |
| --- | --- |
| `tsops dev` | Run local app processes through stable Portless routes |
| `tsops plan` | Validate resources and show the Kubernetes diff |
| `tsops build` | Build selected images or reuse exact source-key results |
| `tsops deploy` | Apply workloads and remove managed orphans |
| `tsops up <overlay>` | Materialise a parameterized preview namespace |
| `tsops down <overlay>` | Run cleanup hooks and destroy a preview namespace |

### Local development

```bash
pnpm tsops dev
pnpm tsops dev --app api
pnpm tsops dev --namespace local
```

`tsops dev` finds `apps.<name>.dev` or the `dev` script under the application's build context. It exports `TSOPS_NAMESPACE` and a complete `TSOPS_DEV_URLS` map to every child process.

### Plan

```bash
pnpm tsops plan --namespace production
pnpm tsops plan --namespace production --app api
pnpm tsops plan --namespace production --dry-run
```

A real plan uses `kubectl diff`. Dry-run skips external commands while validating and rendering the graph.

### Build

```bash
pnpm tsops build --namespace production
pnpm tsops build --filter origin/main
pnpm tsops build --filter origin/main --source-key
pnpm tsops build --app api --force
```

- `--filter <ref>` selects applications from changed files and build contexts.
- `--source-key` enables content-addressed reuse for builds without explicit source-key configuration.
- `--force` bypasses image-existence reuse.
- BuildKit registry cache is configured in `build.cache`.

### Deploy

```bash
pnpm tsops deploy --namespace production
pnpm tsops deploy --namespace production --app api
pnpm tsops deploy --namespace production --image-digests @images.json
```

`--image-digests` accepts an inline JSON object or `@file` mapping application names to immutable digest references. Unknown applications and mutable tags fail before apply.

### Preview environments

```bash
pnpm tsops up preview --var pr=42 --include web
pnpm tsops up preview --var pr=42 --apps-from-changes --base-ref origin/main
pnpm tsops down preview --var pr=42
pnpm tsops down preview --var pr=42 --keep-database
```

Overlay definitions can inherit a stable namespace, route excluded applications through `ExternalName` Services, reuse wildcard TLS, enforce access and namespace policy, and manage a schema-per-preview database lifecycle.

## Configuration loading

The CLI searches for `tsops.config` with these extensions:

```text
.ts, .mts, .cts, .js, .mjs, .cjs
```

Use another path with:

```bash
pnpm tsops plan --config path/to/tsops.config.ts
```

Node.js 24 executes supported TypeScript config syntax directly; a separate `tsx` wrapper is not required for the normal configuration shape.

## CI pattern

A build job can select affected applications and reuse exact images:

```bash
pnpm tsops build --filter origin/main --source-key
```

Pass the resulting immutable references to a separately authorized deploy job:

```bash
pnpm tsops deploy --namespace production --image-digests @images.json
```

This keeps registry work and cluster mutation separate while preserving image identity.

## Packages

- `tsops` — CLI and public `defineConfig` entry point
- `@tsops/core` — typed model and platform-neutral operations
- `@tsops/node` — Node.js adapters
- `@tsops/k8` — deterministic Kubernetes manifest builders

## Documentation

- https://pom4h.github.io/tsops/
- https://github.com/Pom4H/tsops/tree/main/examples
- https://github.com/Pom4H/tsops/blob/main/ROADMAP.md

MIT
