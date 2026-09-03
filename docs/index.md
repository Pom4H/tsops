---
layout: home

hero:
  name: "tsops"
  text: "One typed application graph"
  tagline: From stable local URLs to selective pull-request previews and Kubernetes deploys.
  image:
    src: /logo.svg
    alt: tsops logo
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Compare approaches
      link: /guide/comparison
    - theme: alt
      text: View on GitHub
      link: https://github.com/Pom4H/tsops

features:
  - title: Local topology without port bookkeeping
    details: Run application processes through Portless with stable HTTPS names and automatic Git-worktree isolation.
  - title: Selective preview environments
    details: Materialise a pull-request namespace, deploy only affected apps, and route the rest to a stable base environment.
  - title: Reproducible image delivery
    details: Reuse images by source inputs, combine that with BuildKit registry cache, and hand immutable digests to deploy jobs.
  - title: Diff-first Kubernetes deploys
    details: Validate generated resources, inspect creates and updates, and detect managed orphans before applying a rollout.
  - title: Runtime-aware service discovery
    details: Import the same config from application code and resolve endpoints for local, Docker, or Kubernetes runtimes.
  - title: Compiler-visible operations
    details: Application names and operational relationships are TypeScript symbols rather than strings copied between YAML and env files.
---

## Typed application delivery for Kubernetes

tsops sits between application code and cluster infrastructure. It owns the product-level graph—apps, builds, ports, environments, service relationships, previews, and Kubernetes workloads—while leaving cluster and cloud provisioning to dedicated infrastructure tools.

```text
tsops.config.ts
      │
      ├── tsops dev       stable local URLs
      ├── tsops build     affected, reusable images
      ├── tsops plan      validated Kubernetes diff
      ├── tsops up/down   isolated preview lifecycle
      ├── tsops deploy    deterministic workloads
      └── config.url()    runtime service discovery
```

That boundary is intentionally narrower than general-purpose infrastructure as code and broader than a manifest generator. The same application identity survives from a developer's worktree to a pull-request namespace and production.

## A normal workflow

```bash
pnpm add -D tsops portless

# Local processes, stable *.localhost routes
pnpm tsops dev

# Production delivery
pnpm tsops plan --namespace production
pnpm tsops build --namespace production --source-key
pnpm tsops deploy --namespace production

# Selective pull-request environment
pnpm tsops up preview --var pr=42 --apps-from-changes
pnpm tsops down preview --var pr=42
```

Start with the [getting-started guide](/guide/getting-started), then read [what tsops is](/guide/what-is-tsops) and the [comparison](/guide/comparison) before deciding whether its boundary matches your system.
