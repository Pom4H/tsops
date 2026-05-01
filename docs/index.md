---
layout: home

hero:
  name: "tsops"
  text: "A typed operational model for containerized apps"
  tagline: One TypeScript file describes your product topology — apps, namespaces, secrets, routes, dependencies. tsops uses it as the source of truth for builds, manifests, and the runtime config your app imports.
  image:
    src: /logo.svg
    alt: tsops logo
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: What is tsops?
      link: /guide/what-is-tsops
    - theme: alt
      text: GitHub
      link: https://github.com/Pom4H/tsops
---

## Install

:::: code-group

```bash [pnpm]
pnpm add tsops
```

```bash [bun]
bun add tsops
```

```bash [npm]
npm install tsops
```

::::

> Works on Node.js 20+/22 LTS and Bun 1.1+ — pick whichever your project already uses.

## The differentiator

Most deploy tools generate manifests. tsops also exposes the same configuration as a **typed import** for your application code:

```ts
// tsops.config.ts is the input to:
//   1. the manifest builder    (kubectl apply)
//   2. the runtime helper      (your app)

import config from './tsops.config'

const apiUrl  = config.url('api', 'service')   // http://api
const region  = config.env('api', 'AWS_REGION')
const ingress = config.url('api', 'ingress')   // https://api.example.com
```

Rename an app, change a port, add a namespace — the TypeScript compiler finds every caller in your codebase. `worken-api` is no longer repeated in seven places that drift independently.

This is what separates tsops from Helm, Kustomize, CDK8s, and Pulumi: **the deploy config and the application's runtime config are the same typed object**.

## Quick example

Create `tsops.config.ts` at your project root:

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
      apiServer: 'https://kubernetes.docker.internal:6443',
      context: 'docker-desktop',
      namespaces: ['dev']
    }
  },

  images: {
    registry: 'ghcr.io/example',
    tagStrategy: 'git-sha'
  },

  apps: {
    web: {
      build: { type: 'dockerfile', context: './web', dockerfile: './web/Dockerfile' },
      ingress: ({ domain }) => ({ domain }),
      env: ({ production }) => ({
        NODE_ENV: production ? 'production' : 'development'
      })
    },
    api: {
      build: { type: 'dockerfile', context: './api', dockerfile: './api/Dockerfile' },
      ingress: ({ domain }) => ({ domain: `api.${domain}` }),
      ports: [{ name: 'http', port: 80, targetPort: 8080 }]
    },
    otelCollector: {
      image: 'otel/opentelemetry-collector:latest'
    }
  }
})
```

Then:

```bash
tsops plan    --namespace prod      # validate, diff, list orphans
tsops build   --app api             # build & push image
tsops deploy  --namespace prod      # apply atomically
```

## Use it from your app at runtime

```ts
import config from './tsops.config'

// Service-to-service (same namespace)
const backendUrl = config.url('api', 'service')   // http://api

// Public ingress
const publicUrl  = config.url('api', 'ingress')   // https://api.example.com

export default async function Page() {
  const res  = await fetch(`${backendUrl}/api/message`, { cache: 'no-store' })
  const data = res.ok ? await res.json() : { message: `HTTP ${res.status}` }
  return <main><p>Backend says: {data.message}</p></main>
}
```

`TSOPS_NAMESPACE` selects the active namespace at runtime. The same code runs in `prod`, in a `pr-857` preview namespace, and locally — no `BACKEND_URL` env to misconfigure.

## Why tsops

<div class="why-grid">
  <div class="why-card">
    <div class="why-icon">🧭</div>
    <div class="why-title">Product topology first</div>
    <div class="why-desc">Describe apps, namespaces, dependencies, and routes once. Manifests are generated as the execution backend, not the source of truth.</div>
  </div>
  <div class="why-card">
    <div class="why-icon">🔁</div>
    <div class="why-title">Single typed object</div>
    <div class="why-desc">The same <code>config</code> is consumed by the manifest builder and your application code. Rename an app — the compiler finds every caller.</div>
  </div>
  <div class="why-card">
    <div class="why-icon">📋</div>
    <div class="why-title">Diff-first planner</div>
    <div class="why-desc"><code>tsops plan</code> validates secrets, diffs every manifest against the cluster, and lists orphans before anything is applied.</div>
  </div>
  <div class="why-card">
    <div class="why-icon">🌐</div>
    <div class="why-title">Service discovery</div>
    <div class="why-desc"><code>config.url(app, scope)</code> resolves to the right DNS for the active namespace. No hardcoded <code>BACKEND_URL</code> strings.</div>
  </div>
  <div class="why-card">
    <div class="why-icon">🔒</div>
    <div class="why-title">Secret guardrails</div>
    <div class="why-desc">Placeholders, missing values, and unknown secret keys are caught before <code>kubectl apply</code> ever runs.</div>
  </div>
  <div class="why-card">
    <div class="why-icon">🧪</div>
    <div class="why-title">Preview overlays</div>
    <div class="why-desc">PR-style namespaces (<code>pr-857</code>) with TLS, BasicAuth, ResourceQuota, per-PR DB schema, and lifecycle hooks as one typed declaration.</div>
  </div>
  <div class="why-card">
    <div class="why-icon">🧹</div>
    <div class="why-title">Drift-free deploys</div>
    <div class="why-desc">Resources tagged <code>tsops/managed=true</code> that disappear from config are flagged as orphans and pruned on deploy.</div>
  </div>
  <div class="why-card">
    <div class="why-icon">🤖</div>
    <div class="why-title">Agent-safe</div>
    <div class="why-desc">Tribal knowledge can't be given to an LLM agent. A typed operational model can. Agents that change infra can rely on the compiler.</div>
  </div>
</div>

## How it compares

| Tool                | Generates manifests | Imported by your app | Catches typos at compile time |
|---------------------|:------------------:|:--------------------:|:----------------------------:|
| Helm / Kustomize    | ✅                 | ❌                    | ❌                           |
| CDK8s               | ✅                 | ❌                    | ✅ (deploy side only)        |
| Pulumi              | ✅                 | ❌                    | ✅ (deploy side only)        |
| **tsops**           | ✅                 | ✅                    | ✅ (deploy + app)            |

## Honest trade-offs

- **Opinionated topology.** tsops models `apps × namespaces × clusters`. If your topology doesn't fit, you'll fight the framework.
- **Application layer only.** Platform components (Traefik, cert-manager, external-secrets, ArgoCD) still live in Helm.
- **No state file.** Drift detection is convention-based (`tsops/managed=true` label), not a Terraform-style state.
- **Node.js runtime.** Adapters live in `@tsops/node`; the core is platform-agnostic if you need to port elsewhere.

## Ready to start?

<div class="cta-grid">
  <div class="cta-card">
    <a href="/guide/what-is-tsops">📖 What is tsops?</a>
    <p>The mental model in five minutes.</p>
  </div>
  <div class="cta-card">
    <a href="/guide/getting-started">🚀 Getting started</a>
    <p>Install and ship your first app.</p>
  </div>
  <div class="cta-card">
    <a href="/examples/">💡 Examples</a>
    <p>Monorepo, full-stack, observability, previews.</p>
  </div>
  <div class="cta-card">
    <a href="/api/">🔧 API reference</a>
    <p>Helpers, types, and CLI.</p>
  </div>
</div>

<style>
.why-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
  margin: 2rem 0 1rem;
}

.why-card {
  padding: 1.25rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.why-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 28px rgba(0,0,0,0.06);
}

.why-icon { font-size: 1.4rem; line-height: 1; }
.why-title { margin-top: 0.6rem; font-weight: 700; }
.why-desc  { margin-top: 0.35rem; color: var(--vp-c-text-2); }

.cta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin: 2rem 0;
}

.cta-card {
  padding: 1.25rem 1.5rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  text-align: left;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.cta-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 28px rgba(0,0,0,0.06);
}

.cta-card a { display: inline-block; font-size: 1.05rem; font-weight: 700; }
.cta-card p { margin-top: 0.4rem; color: var(--vp-c-text-2); }
</style>
