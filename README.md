# tsops

TypeScript-first toolkit for planning, building, and deploying to Kubernetes.

[![npm version](https://badge.fury.io/js/tsops.svg)](https://www.npmjs.com/package/tsops)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start

```bash
# Install globally
npm install -g tsops

# Or as a dev dependency
npm install -D tsops
```

Then create a `tsops.config.ts` file:

```typescript
import { defineConfig } from 'tsops'

export default defineConfig({
  project: 'myapp',
  
  namespaces: {
    dev: {
      domain: 'dev.myapp.com',
      replicas: 1
    },
    prod: {
      domain: 'myapp.com',
      replicas: 3
    }
  },
  
  clusters: {
    'us-cluster': {
      apiServer: 'https://k8s.us.example.com',
      context: 'us-k8s',
      namespaces: ['dev', 'prod']
    }
  },
  
  images: {
    registry: 'ghcr.io/myorg',
    tagStrategy: 'git-sha'
  },
  
  apps: {
    api: {
      host: ({ domain }) => `api.${domain}`,
      build: {
        type: 'dockerfile',
        context: '.',
        dockerfile: 'Dockerfile'
      },
      env: ({ replicas }) => ({
        NODE_ENV: replicas > 1 ? 'production' : 'development',
        REPLICAS: String(replicas)
      }),
      network: {
        ingress: {
          className: 'nginx'
        },
        certificate: {
          issuerRef: {
            kind: 'ClusterIssuer',
            name: 'letsencrypt-prod'
          }
        }
      }
    }
  }
})
```

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

## Features

- 🎯 **Type-safe configuration** - Full TypeScript support with autocompletion
- 🐳 **Docker integration** - Build and push images automatically
- ☸️ **Kubernetes manifests** - Generate deployments, services, ingresses
- 🔒 **Secrets management** - Manage secrets securely
- 🌍 **Multi-region support** - Deploy to multiple clusters
- 🚀 **CI/CD friendly** - Perfect for GitHub Actions, GitLab CI, etc.

## Documentation

Full documentation is available at [your-docs-url]

## Packages

This is a monorepo containing:

- **`tsops`** - Main CLI package (install this one!)
- **`@tsops/core`** - Core library with programmatic API
- **`@tsops/k8`** - Kubernetes manifest builders

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

## License

MIT © Roman Popov

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
