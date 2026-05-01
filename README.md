# tsops

**A typed operational model for containerized apps.** One TypeScript file describes your product topology — apps, namespaces, secrets, routes, dependencies — and tsops uses it as the source of truth for builds, manifests, and the runtime config your app imports.

[![npm version](https://badge.fury.io/js/tsops.svg)](https://www.npmjs.com/package/tsops)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

```bash
pnpm add tsops    # or: bun add tsops / npm install tsops
```

> Runs on Node.js 20+/22 LTS or Bun 1.1+.

## What makes tsops different

Most deploy tools generate manifests. tsops also gives your application code a **typed import** of the same configuration:

```ts
// tsops.config.ts          → input to manifest builder AND runtime helper
// frontend/src/api.ts      → consumes the same config
import config from '../tsops.config'

const apiUrl = config.url('api', 'service')   // http://api
const region = config.env('api', 'AWS_REGION')
```

Rename an app, change a port, move a service to another namespace — the TypeScript compiler finds every caller in your codebase. No more "wrong service name → 502 in preview".

This is the actual differentiator vs Helm, Kustomize, CDK8s, or Pulumi: tsops is the only one where **the deploy config and the application's runtime config are the same typed object**.

## Quick start

```typescript
import { defineConfig } from 'tsops'

export default defineConfig({
  project: 'orchard',

  namespaces: {
    dev:  { domain: 'dev.example.com', production: false },
    prod: { domain: 'example.com',     production: true  }
  },

  clusters: {
    platform: {
      apiServer: 'https://k8s.example.com',
      context: 'prod',
      namespaces: ['dev', 'prod']
    }
  },

  images: {
    registry: 'ghcr.io/example',
    tagStrategy: 'git-sha',
    includeProjectInName: true
  },

  secrets: {
    'api-secrets': ({ production }) => ({
      JWT_SECRET: production ? process.env.JWT_SECRET ?? '' : 'dev-secret'
    })
  },

  apps: {
    api: {
      build: {
        type: 'dockerfile',
        context: './apps/api',
        dockerfile: './apps/api/Dockerfile'
      },
      ingress: ({ domain }) => ({ domain: `api.${domain}` }),
      ports: [{ name: 'http', port: 80, targetPort: 8080 }],
      env: ({ production, secret }) => ({
        NODE_ENV: production ? 'production' : 'development',
        JWT_SECRET: secret('api-secrets', 'JWT_SECRET')
      })
    }
  }
})
```

```bash
tsops plan    --namespace prod          # diff cluster vs config, validate secrets, list orphans
tsops build   --app api                 # build & push images
tsops deploy  --namespace prod          # apply atomically, prune orphans
```

## The product-topology-first model

A typical preview namespace, fallbacks, BasicAuth, per-PR DB schema, TLS — without tsops you assemble it from Helm + Kustomize + GitHub Actions YAML + glue scripts. The pattern is well-known. The pain isn't the pattern — it's that the operational model lives in seven places and the compiler can't see any of them.

`worken-api` is repeated in:

- Helm values
- Service & IngressRoute backends
- ExternalName fallbacks
- CI matrix
- Secret keys
- Cleanup scripts
- Application ENV

Errors are runtime: wrong service name → 502, wrong fallback target → preview talks to staging, missing BasicAuth annotation → public preview leaks integrations.

tsops moves all of this into one typed graph:

```
Without tsops:  Kubernetes-first  →  product semantics encoded by conventions
With tsops:     Product topology  →  Kubernetes generated as execution backend
```

The same compiler that protects your application code now protects your operational model.

## Design-time guarantees

| Surface                  | Without tsops                | With tsops                     |
|--------------------------|------------------------------|--------------------------------|
| Service URL in app       | string in `.env`             | `config.url('api', 'service')` |
| Renaming an app          | grep + hope                  | compile error in every caller  |
| Missing secret value     | CrashLoopBackOff at runtime  | `tsops plan` blocks deploy     |
| Drift detection          | manual audit                 | orphan report on every plan    |
| Cross-namespace fallback | ExternalName YAML            | typed overlay configuration    |
| Preview env lifecycle    | bash + GitHub Actions        | `tsops up/down`                |

## Preview overlays

PR-style preview namespaces (`pr-857`) are first-class. One overlay declaration covers TLS, BasicAuth, ResourceQuota, per-PR DB schema with pre-deploy migration job, runtime secret generation, and post-destroy cleanup. See [`docs/guide/preview-overlays.md`](./docs/guide/preview-overlays.md).

```bash
tsops up   preview --var pr=857
tsops down preview --var pr=857
```

## Service discovery, done right

`config.url(app, scope)` resolves to the right DNS for the active runtime:

```ts
config.url('api', 'service')   // http://api                              (same namespace)
config.url('api', 'cluster')   // http://api.prod.svc.cluster.local       (cross-namespace)
config.url('api', 'ingress')   // https://api.example.com                 (public)
```

Active namespace is selected by `TSOPS_NAMESPACE`. Same code runs in production, preview, and locally — no `BACKEND_URL` env to misconfigure.

## Honest trade-offs

- **Opinionated topology.** tsops models `apps × namespaces × clusters`. If your topology doesn't fit, you'll fight the framework.
- **Application layer only.** Platform components (Traefik, cert-manager, external-secrets, ArgoCD) still live in Helm. tsops covers what you ship, not the cluster you ship it to.
- **No state file.** Drift is detected via labels (`tsops/managed=true`) and orphan scanning, not a Pulumi/Terraform-style state. Convention, not contract.
- **Node.js runtime.** Adapters live in `@tsops/node`. The core (`@tsops/core`) is platform-agnostic if you need to port elsewhere.

## Packages

- **`tsops`** — CLI and `defineConfig`
- **`@tsops/core`** — orchestrator, resolvers, planner (platform-agnostic)
- **`@tsops/node`** — Docker / kubectl / Git-aware adapters
- **`@tsops/k8`** — typed Kubernetes manifest builders (Deployment, Service, Ingress, Traefik IngressRoute, Certificate)

## Why this matters for AI agents

Tribal knowledge ("don't touch this Helm value", "remember to attach the BasicAuth middleware") cannot be transferred to an LLM agent — it isn't written down anywhere. Typed contracts can. The more of your infra changes are made by Renovate, Dependabot, Claude Code, or Copilot Workspace, the more the value of tsops compounds.

A typed operational model is a model that an agent can safely modify.

## Documentation

Full docs: <https://pom4h.github.io/tsops/>

- [What is tsops?](./docs/guide/what-is-tsops.md)
- [Getting started](./docs/guide/getting-started.md)
- [Context helpers](./docs/guide/context-helpers.md)
- [Secrets & ConfigMaps](./docs/guide/secrets.md)
- [Preview overlays](./docs/guide/preview-overlays.md)
- [Architecture](./ARCHITECTURE.md)

## Development

```bash
pnpm install
pnpm build           # build all packages
pnpm build:watch
pnpm lint
pnpm docs:dev        # docs locally at http://localhost:5173/tsops/
```

## License

MIT © Roman Popov

## Contributing

PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).
