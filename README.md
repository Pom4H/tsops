# tsops

**One typed application graph from localhost to Kubernetes.**

tsops is an application delivery toolkit for TypeScript monorepos. Define applications, ports, images, environments, dependencies, and preview topology once in `tsops.config.ts`, then use that same model to:

- run local processes behind stable, worktree-aware URLs;
- build only affected images and reuse content-addressed results;
- inspect Kubernetes changes before applying them;
- create selective, isolated pull-request environments;
- resolve service URLs from application code without duplicating topology in environment variables.

The configuration is not merely a nicer way to generate YAML. It is a typed contract shared by the delivery toolchain and the applications it operates.

## Why tsops exists

A typical containerized product accumulates several partially overlapping descriptions of itself: package scripts, Docker build rules, local port conventions, CI matrices, Helm values, preview-environment scripts, and application environment variables. They drift because no compiler can prove that `BACKEND_URL`, a Service name, a Docker context, and a pull-request namespace still refer to the same application.

tsops makes the application graph the source of truth:

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
      env: ({ url }) => ({
        API_URL: url('api', 'service')
      }),
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

Renaming `api`, changing its port, or selecting another runtime now travels through one typed graph instead of several strings maintained by convention.

## The delivery loop

### Local development

Node.js 24+ is the supported runtime. Portless is optional and used by `tsops dev`.

```bash
pnpm add -D tsops portless
pnpm tsops dev
```

For the configuration above, local processes receive stable routes such as:

```text
https://api.orchard.localhost
https://web.orchard.localhost
```

Git worktrees get isolated route prefixes automatically, so a developer and multiple coding agents can run the same topology concurrently without coordinating ports.

### Plan, build, deploy

```bash
pnpm tsops plan --namespace production
pnpm tsops build --namespace production --source-key
pnpm tsops deploy --namespace production
```

`plan` validates generated resources and reports creates, updates, unchanged resources, and managed orphans. `build --source-key` reuses an existing immutable image when the selected source inputs and build metadata have not changed. `deploy` can also consume explicit digest overrides produced by CI.

### Pull-request environments

Overlay namespaces inherit a stable environment and deploy only selected applications. Everything else can resolve back to the base namespace through generated `ExternalName` Services.

```bash
pnpm tsops up preview --var pr=42 --apps-from-changes --base-ref origin/main
pnpm tsops down preview --var pr=42
```

Optional lifecycle hooks cover wildcard TLS reuse, access gates, namespace quotas, and schema-per-preview PostgreSQL isolation.

## Positioning

**tsops is typed application delivery for Kubernetes, not general-purpose infrastructure as code.**

It deliberately does not provision clusters, cloud accounts, networks, or every managed service. Pulumi and Terraform are better choices for that layer. It does not attempt to replace the chart ecosystem of Helm, and it is not yet a replacement for Tilt or Skaffold when remote-cluster file synchronization is the primary requirement.

The useful boundary is the product application graph: local processes, container builds, runtime service discovery, preview environments, and Kubernetes workloads.

See [How tsops compares](docs/guide/comparison.md) and the focused [roadmap](ROADMAP.md).

## Packages

| Package | Responsibility |
| --- | --- |
| [`tsops`](packages/cli) | CLI and `defineConfig` entry point |
| [`@tsops/core`](packages/core) | Typed domain model, resolvers, planner, builder, deployer |
| [`@tsops/node`](packages/node) | Node.js adapters for Git, Docker, `kubectl`, and process execution |
| [`@tsops/k8`](packages/k8) | Deterministic Kubernetes manifest builders |

## Repository workflow

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm docs:build
```

Read the [documentation](https://pom4h.github.io/tsops/), browse the runnable [`examples/`](examples), or see [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change.

## License

MIT
