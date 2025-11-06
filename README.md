# tsops

TypeScript-first toolkit for planning, building, and deploying containerized applications.

[![npm version](https://badge.fury.io/js/tsops.svg)](https://www.npmjs.com/package/tsops)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start

```bash
npm install tsops

or

pnpm add tsops
```

Then create a `tsops.config.ts` file:

```typescript
import { defineConfig } from 'tsops'

export default defineConfig({
  project: 'orchard',

  namespaces: {
    dev: { domain: 'dev.example.com', production: false },
    prod: { domain: 'example.com', production: true }
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
      JWT_SECRET: production
        ? process.env.JWT_SECRET ?? ''
        : 'dev-secret'
    })
  },

  apps: {
    api: {
      build: {
        type: 'dockerfile',
        context: './apps/api',
        dockerfile: './apps/api/Dockerfile'
      },
      // Simple object format - protocol auto-detects based on domain
      ingress: ({ domain }) => ({ domain: `api.${domain}` }),
      // Or explicit: protocol: production ? 'https' : 'http'
      ports: [{ name: 'http', port: 80, targetPort: 8080 }],
      env: ({ production, secret }) => ({
        NODE_ENV: production ? 'production' : 'development',
        JWT_SECRET: secret('api-secrets', 'JWT_SECRET'),
        STRIPE_API_KEY: secret('api-secrets', 'STRIPE_KEY')
        // ⚠️ Don't put service URLs here! Use DNS directly in your app:
        // fetch('http://postgres/api') instead of process.env.POSTGRES_URL
      })
    }
  }
})
```

Root-level secrets and configMaps execute in Node, so read environment variables directly via `process.env` (or your own helper) instead of the app-level `env()` helper.

Run commands:

```bash
# Plan what will be deployed
tsops plan
tsops plan --namespace prod --app api

# Build Docker images
tsops build
tsops build --app api

# Deploy applications
tsops deploy --namespace prod
tsops deploy --namespace prod --app api
```

`tsops plan` resolves your configuration, validates shared resources once, previews per-app manifest updates with diffs, and lists orphaned resources that would be removed. Add `--dry-run` to inspect without invoking Docker or deployment tools. `tsops deploy` reuses that plan, blocks on missing secret values, applies manifests atomically, and cleans up orphans at the end.

## Key Principle

**tsops embraces Service Discovery.** Don't hardcode service URLs in ENV variables—use internal DNS directly in your application code. ENV is for secrets, external APIs, and configuration, not for internal service endpoints.

## Features

- 🎯 **Type-safe configuration** - Full TypeScript support with autocompletion
- 📋 **Diff-first planning** - Validate namespaces/secrets/configMaps once and preview manifest updates
- 🐳 **Docker integration** - Build and push images automatically
- 🌐 **Manifests & networking** - Generate deployments, services, and ingress from a single definition
- 🔒 **Secret validation** - Catch placeholders and missing keys before deploy
- 🧹 **Orphan cleanup** - Detect and delete resources not declared in code
- 🔗 **Service Discovery First** - Encourages proper internal DNS patterns

## Documentation

Full documentation is available at [GitHub Pages](https://pom4h.github.io/tsops/)

## Packages

This is a monorepo containing:

- **`tsops`** – CLI and configuration helper exports
- **`@tsops/core`** – Core library with programmatic API
- **`@tsops/node`** – Node-specific adapters and `createNodeTsOps`
- **`@tsops/k8`** – Manifest builders for Kubernetes

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run in watch mode
pnpm build:watch

# Lint
pnpm lint

# Run docs locally
pnpm docs:dev
```

## Service Discovery (Important!)

**⚠️ Anti-pattern: Do NOT use ENV variables for service-to-service communication endpoints.**

Hardcoding service URLs in ENV breaks the Service Discovery pattern and creates tight coupling. Instead, use the runtime config helpers in your application code.

### ❌ Wrong: Hardcoding in ENV

```typescript
// DON'T DO THIS
env: () => ({
  BACKEND_URL: 'http://backend:3000'  // ❌ Hardcoded!
})

// In your app:
fetch(process.env.BACKEND_URL)  // ❌ Not type-safe, breaks namespace switching
```

**Problems:**
- Breaks Service Discovery
- Not type-safe
- Doesn't respect `TSOPS_NAMESPACE`
- Hardcoded ports and hostnames

### ✅ Correct: Use runtime config

```typescript
// In your app code:
import config from './tsops.config'

// Short DNS (same namespace)
const BACKEND_URL = config.url('backend', 'service')  // http://backend
// Or full cluster DNS (cross-namespace safe):
const BACKEND_URL = config.url('backend', 'cluster')  // http://backend.prod.svc.cluster.local

fetch(`${BACKEND_URL}/api/data`)  // ✅ Type-safe, namespace-aware!
```

**Benefits:**
- Type-safe (compile-time checking)
- Respects `TSOPS_NAMESPACE` environment variable
- Single source of truth
- Platform handles service resolution automatically
- Zero-downtime deployments work correctly

### When to use ENV

Use ENV variables **only** for:
- **Secrets**: API keys, passwords, tokens
- **External services**: Third-party APIs, databases outside the cluster
- **Feature flags**: Application behavior configuration
- **Build-time values**: Version numbers, git commits

```typescript
env: ({ secret, env }) => ({
  JWT_SECRET: secret('api-secrets', 'JWT_SECRET'),    // ✅ Secret
  STRIPE_API_KEY: secret('payment', 'STRIPE_KEY'),    // ✅ Secret
  EXTERNAL_API: 'https://api.external.com',           // ✅ External service
  DATABASE_HOST: env('EXTERNAL_DB_HOST'),             // ✅ External database
  LOG_LEVEL: 'info',                                  // ✅ Config
  GIT_SHA: env('GIT_SHA', 'dev')                      // ✅ Build-time value
})
```

**Never** put internal service URLs in ENV - use `config.url()` in runtime instead.

## Runtime Helpers

Import the compiled config in your application to reuse resolved values at runtime. The active namespace is selected via the `TSOPS_NAMESPACE` environment variable (defaults to the first namespace).

```typescript
import config from './tsops.config.js'

const nodeEnv = config.env('api', 'NODE_ENV')
const external = config.url('api', 'ingress') // https://api.dev.example.com (public endpoint)
```

**Note:** Runtime helpers are primarily for getting public ingress URLs, not for service-to-service communication (use DNS directly for that).

## License

MIT © Roman Popov

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
