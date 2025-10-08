# tsops

TypeScript-first toolkit for planning, building, and deploying to Kubernetes.

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
      network: ({ domain }) => `api.${domain}`,
      ports: [{ name: 'http', port: 80, targetPort: 8080 }],
      env: ({ production, serviceDNS, template, secret }) => ({
        NODE_ENV: production ? 'production' : 'development',
        DATABASE_URL: template('postgresql://{host}/app', {
          host: serviceDNS('postgres', 5432)
        }),
        JWT_SECRET: secret('api-secrets', 'JWT_SECRET')
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

# Deploy to Kubernetes
tsops deploy --namespace prod
tsops deploy --namespace prod --app api
```

`tsops plan` resolves your configuration, validates shared resources once, previews per-app manifest updates with diffs, and lists orphaned resources that would be removed. Add `--dry-run` to inspect without invoking Docker or kubectl. `tsops deploy` reuses that plan, blocks on missing secret values, applies manifests atomically, and cleans up orphans at the end.

## Features

- 🎯 **Type-safe configuration** - Full TypeScript support with autocompletion
- 📋 **Diff-first planning** - Validate namespaces/secrets/configMaps once and view per-app manifest diffs
- 🐳 **Docker integration** - Build and push images automatically
- ☸️ **Manifests & networking** - Generate deployments, services, ingresses, and Traefik routes from a single definition
- 🔒 **Secret validation** - Catch placeholders and missing keys before deploy
- 🧹 **Orphan cleanup** - Detect and delete resources not declared in code

## Documentation

Full documentation is available at [GitHub Pages](https://pom4h.github.io/tsops/)

## Packages

This is a monorepo containing:

- **`tsops`** – CLI and configuration helper exports
- **`@tsops/core`** – Core library with programmatic API
- **`@tsops/node`** – Node-specific adapters and `createNodeTsOps`
- **`@tsops/k8`** – Kubernetes manifest builders

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

## Runtime Helpers

Import the compiled config in your application to reuse resolved values at runtime. The active namespace is selected via the `TSOPS_NAMESPACE` environment variable (defaults to the first namespace).

```typescript
import config from './tsops.config.js'

const env = config.getEnv('api')
const internal = config.getInternalEndpoint('api') // http://project-api.dev.svc.cluster.local:3000
const external = config.getExternalEndpoint('api') // https://api.dev.example.com (if network configured)
```

## License

MIT © Roman Popov

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
