---
layout: home

hero:
  name: "tsops"
  text: "TypeScript-first Kubernetes toolkit"
  tagline: Deploy to Kubernetes with confidence using type-safe configuration
  image:
    src: /logo.svg
    alt: tsops logo
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View Examples
      link: /examples/
    - theme: alt
      text: GitHub
      link: https://github.com/Pom4H/tsops
  
---

## Installation

:::: code-group

```bash [npm]
npm install tsops
```

```bash [pnpm]
pnpm add tsops
```

```bash [yarn]
yarn add tsops
```

```bash [bun]
bun add tsops
```

::::

## Quick Example
Create this file at the root of your project as `tsops.config.ts`.

```typescript
import { defineConfig } from 'tsops'

export default defineConfig({
  project: 'my-app',
  
  namespaces: {
    dev: { domain: 'dev.example.com', production: false },
    prod: { domain: 'example.com', production: true },
  },
  
  clusters: {
    local: {
      apiServer: 'https://kubernetes.docker.internal:6443',
      context: 'docker-desktop',
      namespaces: ['dev']
    }
  },
  
  images: {
    registry: 'ghcr.io/yourorg',
    tagStrategy: 'git-sha'
  },
  
  apps: {
    web: {
      ingress: ({ domain }) => domain,
      build: {
        type: 'dockerfile',
        context: './web',
        dockerfile: './web/Dockerfile'
      },
      env: ({ production, dns }) => ({
        NODE_ENV: production ? 'production' : 'development',
        OTEL_EXPORTER_OTLP_ENDPOINT: dns('otelCollector')
      })
    },
    api: {
      ingress: ({ domain }) => `api.${domain}`,
      build: {
        type: 'dockerfile',
        context: './api',
        dockerfile: './api/Dockerfile'
      },
      env: ({ dns }) => ({
        OTEL_EXPORTER_OTLP_ENDPOINT: dns('otelCollector')
      })
    },
    otelCollector: {
      image: 'otel/opentelemetry-collector:latest'
    }
  }
})
```


 

## Use in your app (runtime)

Import your `tsops.config.ts` in any service to access resolved endpoints and env at runtime.

```ts
// frontend/app/page.ts (or any service file)
import config from './tsops.config'

// Automatically respects TSOPS_NAMESPACE (dev/prod)
const backendBase = config.url('api', 'ingress')
// e.g. https://api.dev.example.com

export default async function Page() {
  const res = await fetch(`${backendBase}/api/message`, { cache: 'no-store' })
  const data = res.ok ? await res.json() : { message: `HTTP ${res.status}` }
  return (
    <main>
      <h1>Frontend</h1>
      <p>Backend says: {data.message}</p>
    </main>
  )
}
```

## Why tsops?

<div class="why-grid">
  <div class="why-card">
    <div class="why-icon">🎯</div>
    <div class="why-title">TypeScript-First</div>
    <div class="why-desc">Author Kubernetes strategy in TypeScript with full IntelliSense, literal inference, and compile-time guarantees.</div>
  </div>
  <div class="why-card">
    <div class="why-icon">📋</div>
    <div class="why-title">Diff-First Planner</div>
    <div class="why-desc">Use <code>planWithChanges()</code> or the CLI to validate namespaces, view manifest diffs, and spot errors before deploy.</div>
  </div>
  <div class="why-card">
    <div class="why-icon">✨</div>
    <div class="why-title">Smart Helpers</div>
    <div class="why-desc">Access helpers like <code>dns()</code>, <code>secret()</code>, and <code>template()</code> directly inside app definitions.</div>
  </div>
  <div class="why-card">
    <div class="why-icon">🔒</div>
    <div class="why-title">Secret Guardrails</div>
    <div class="why-desc">Catch placeholder values and missing keys automatically; reuse existing cluster secrets when appropriate.</div>
  </div>
  <div class="why-card">
    <div class="why-icon">🌐</div>
    <div class="why-title">Auto Networking</div>
    <div class="why-desc">Generate ingress, Traefik routes, and TLS certificates by returning a domain from <code>network</code> definitions.</div>
  </div>
  <div class="why-card">
    <div class="why-icon">🔁</div>
    <div class="why-title">Runtime Reuse</div>
    <div class="why-desc">Import the same config at runtime, switch namespaces with <code>TSOPS_NAMESPACE</code>, and resolve endpoints on demand.</div>
  </div>
  <div class="why-card">
    <div class="why-icon">⚙️</div>
    <div class="why-title">CI/CD Ready</div>
    <div class="why-desc">Git-aware environment providers, deterministic image tags, and <code>--dry-run</code> flows slot neatly into pipelines.</div>
  </div>
  <div class="why-card">
    <div class="why-icon">🧹</div>
    <div class="why-title">Drift-Free Clusters</div>
    <div class="why-desc">Automated orphan detection and cleanup keep Kubernetes in sync with your declared configuration.</div>
  </div>
</div>

## What People Say

> "tsops transformed our deployment workflow. No more YAML hell, just clean TypeScript configuration."
> 
> — *Production User*

> "The context helpers are a game-changer. dns() alone saved us hours of configuration work."
> 
> — *DevOps Engineer*

> "Secret validation caught so many issues before they hit production. This tool pays for itself."
> 
> — *Platform Team Lead*

## Ready to Get Started?

<div class="cta-grid">
  <div class="cta-card">
    <a href="/guide/getting-started">📚 Read the Guide</a>
    <p>Learn the basics and deploy your first app.</p>
  </div>
  <div class="cta-card">
    <a href="/examples/">💡 See Examples</a>
    <p>Explore monorepo, fullstack, and observability setups.</p>
  </div>
  <div class="cta-card">
    <a href="/api/">🔧 API Reference</a>
    <p>Full API for helpers, types, and CLI.</p>
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

.why-icon {
  font-size: 1.4rem;
  line-height: 1;
}

.why-title {
  margin-top: 0.6rem;
  font-weight: 700;
}

.why-desc {
  margin-top: 0.35rem;
  color: var(--vp-c-text-2);
}

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

.cta-card a {
  display: inline-block;
  font-size: 1.05rem;
  font-weight: 700;
}

.cta-card p {
  margin-top: 0.4rem;
  color: var(--vp-c-text-2);
}
</style>
