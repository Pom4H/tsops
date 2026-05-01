# What is tsops?

**tsops is a typed operational model for containerized applications.**

You describe your product topology in TypeScript — apps, namespaces, secrets, ports, routes, dependencies, overlays. tsops uses that single description as the source of truth for three different things:

1. **Builds** — what images to build and tag
2. **Manifests** — what to apply to Kubernetes
3. **Runtime config** — what your application code imports to find services and secrets

The third item is the one that matters. It's also what no other tool gives you.

## The problem tsops solves

A working preview-environment-with-fallbacks setup is not hard to design. An experienced DevOps engineer can sketch it in an afternoon:

```
PR #123 → CI → namespace pr-123 → real deploys for changed apps
                                → ExternalName fallbacks for the rest
                                → BasicAuth + ResourceQuota
                                → per-PR DB schema
                                → preview URL posted back to PR
```

The pattern is well-known. The pain isn't the pattern — it's that the operational model lives in seven places and the compiler can't see any of them.

The name `worken-api` ends up repeated in:

- Helm values
- Service and IngressRoute backends
- ExternalName fallback targets
- GitHub Actions matrix
- Secret keys
- Cleanup scripts
- The application's `BACKEND_URL` env

When something drifts, the failure mode is runtime:

| Mistake                              | Symptom                            |
|--------------------------------------|------------------------------------|
| Wrong service name in IngressRoute   | 502                                |
| Wrong secret key                     | Pod CrashLoopBackOff               |
| Wrong fallback target                | Preview talks to staging backend   |
| Missing BasicAuth annotation         | Public preview leaks integrations  |
| Wrong namespace in deploy            | Accidental staging overwrite       |

You can mitigate this with templates, conventions, and CI smoke tests — but the TypeScript compiler is sitting right there, and it can't help, because the operational model isn't TypeScript.

## What tsops actually does

tsops moves the operational model into one typed graph. The same `tsops.config.ts` is consumed by:

```
                tsops.config.ts
                /             \
   manifest builder        runtime helper
   (kubectl apply)         (your app code)
```

```ts
// In your app:
import config from '../tsops.config'

const apiUrl = config.url('api', 'service')  // http://api
```

If you rename the `api` app to `core-api` in `tsops.config.ts`, every caller of `config.url('api', ...)` becomes a compile error. Same for `config.env('api', 'JWT_SECRET')` if `JWT_SECRET` disappears from the secret. That's the core idea.

## How it differs from existing tools

| Tool             | Generates manifests | Imported by your app | Catches typos at compile time |
|------------------|:-------------------:|:--------------------:|:----------------------------:|
| Helm / Kustomize | ✅                  | ❌                   | ❌                           |
| CDK8s            | ✅                  | ❌                   | ✅ (deploy side only)        |
| Pulumi           | ✅                  | ❌                   | ✅ (deploy side only)        |
| **tsops**        | ✅                  | ✅                   | ✅ (deploy + app)            |

CDK8s and Pulumi solve half the problem: typed manifest generation. They still leave you wiring up `BACKEND_URL` env vars and praying you spelled the service name right. tsops closes that loop.

## The two paradigms, stated plainly

```
Without tsops:  Kubernetes-first  →  product semantics encoded by conventions
With tsops:     Product topology  →  Kubernetes generated as execution backend
```

That's the entire shift. Everything else — the CLI, the planner, the secret validation, the preview overlays — follows from that inversion.

## A minimal example

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
    tagStrategy: 'git-sha'
  },

  secrets: {
    'api-secrets': ({ production }) => ({
      JWT_SECRET: production ? process.env.JWT_SECRET ?? '' : 'dev-secret'
    })
  },

  apps: {
    api: {
      build: { type: 'dockerfile', context: './apps/api', dockerfile: './apps/api/Dockerfile' },
      ingress: ({ domain }) => ({ domain: `api.${domain}` }),
      ports: [{ name: 'http', port: 80, targetPort: 8080 }],
      env: ({ secret }) => ({
        JWT_SECRET: secret('api-secrets', 'JWT_SECRET')
      })
    }
  }
})
```

Then:

```bash
tsops plan --namespace prod
```

```
📋 Generating deployment plan and validating manifests...

🌐 Global Resources
   ➕ Namespaces to create:  prod
   ✅ Secret/api-secrets:    valid (JWT_SECRET set from env)

📦 Application Resources
   api @ prod (api.example.com)
   Image: ghcr.io/example/orchard-api:abc123

      ➕ Will create:
         • Deployment/orchard-api
         • Service/orchard-api
         • Ingress/orchard-api

✅ Validation passed. Run "tsops deploy" to apply.
```

If `process.env.JWT_SECRET` is missing, `tsops plan` blocks with a typed error before `kubectl` is ever invoked.

## What tsops gives you, concretely

- **`tsops plan`** — diff the cluster against your config, validate every secret, list orphans. Errors fail the command.
- **`tsops deploy`** — apply the planned manifests atomically. Prune orphans tagged `tsops/managed=true`.
- **`tsops build`** — resolve image references and invoke Docker.
- **`tsops up/down preview`** — overlay-based PR preview namespaces with TLS, BasicAuth, ResourceQuota, per-PR DB schema, and lifecycle hooks.
- **`config.url(app, scope)`** — `service` / `cluster` / `ingress` DNS resolution at runtime, namespace-aware via `TSOPS_NAMESPACE`.
- **`config.env(app, key)`** — typed access to resolved environment for a given app.
- **Type safety end to end** — IntelliSense for app names, secret keys, namespace variables. Renaming an app is a refactor, not a search-and-replace.

## Honest trade-offs

- **Opinionated topology.** tsops models `apps × namespaces × clusters` plus overlays. If your topology doesn't fit, you'll fight the framework.
- **Application layer only.** Platform components — Traefik, cert-manager, external-secrets, ArgoCD, the Postgres operator — still live in Helm. tsops covers what you ship, not the cluster you ship it to.
- **No state file.** Drift detection is convention-based (`tsops/managed=true` label) and orphan scanning, not a Pulumi/Terraform-style state store.
- **One config can grow large.** In a 30-service monorepo the config becomes its own subproject that needs to be split across files.
- **Node.js runtime.** Adapters live in `@tsops/node`. The core (`@tsops/core`) is platform-agnostic if you need to embed it elsewhere.

## Why this matters more every year

The percentage of infrastructure changes made by automated tools — Renovate, Dependabot, Claude Code, Copilot Workspace — is going up, not down.

Tribal knowledge ("don't touch this Helm value", "remember to attach the BasicAuth middleware") cannot be transferred to an LLM agent. It isn't written down anywhere. A typed contract can. A typed operational model is one that an agent can safely modify.

The same compiler that protects your application code, protecting your operational model — that's tsops.

## Next

- [Getting started](./getting-started.md)
- [Quick start](./quick-start.md)
- [Context helpers](./context-helpers.md)
- [Secrets & ConfigMaps](./secrets.md)
- [Preview overlays](./preview-overlays.md)
