# Getting Started

Get up and running with tsops in minutes.

## Prerequisites

- Node.js 18+ or 20+
- Docker (for building images)
- kubectl configured with cluster access
- TypeScript knowledge

## Installation

::: code-group

```bash [pnpm]
npm install tsops
```

```bash [npm]
pnpm add tsops
```

```bash [yarn]
yarn add tsops
```

:::

## Create Configuration

Create `tsops.config.ts` in your project root:

```typescript
import { defineConfig } from 'tsops'

export default defineConfig({
  project: 'my-app',
  
  namespaces: {
    production: {
      domain: 'example.com'
    }
  },
  
  clusters: {
    production: {
      apiServer: 'https://your-k8s-api.com:6443',
      context: 'production',
      namespaces: ['production']
    }
  },
  
  images: {
    registry: 'ghcr.io/yourorg',
    tagStrategy: 'git-sha'
  },
  
  apps: {
    api: {
      build: {
        type: 'dockerfile',
        context: './api',
        dockerfile: './api/Dockerfile'
      },
      
      network: ({ domain }) => `api.${domain}`,
      
      env: ({ serviceDNS, template, production }) => ({
        NODE_ENV: production ? 'production' : 'development',
        DB_URL: template('postgresql://{host}/mydb', {
          host: serviceDNS('postgres', 5432)
        })
      })
    }
  }
})
```

## Add Scripts

Add to your `package.json`:

```json
{
  "scripts": {
    "deploy": "tsops deploy",
    "deploy:prod": "tsops deploy --namespace production",
    "plan": "tsops plan",
    "build": "tsops build"
  }
}
```

## Deploy Your App

### Step 1: Plan

See what will be deployed:

```bash
pnpm tsops plan
```

Output:
```
- api @ production (prod) -> ghcr.io/yourorg/api:abc123, host=api.example.com
```

### Step 2: Build

Build Docker images:

```bash
pnpm tsops build
```

### Step 3: Deploy

Deploy to Kubernetes:

```bash
pnpm tsops deploy --namespace production
```

Output:
```
- api @ production
  • Namespace/production
  • Secret/api-secrets
  • Deployment/my-app-api
  • Service/my-app-api
  • Ingress/my-app-api
```

## Verify Deployment

Check your deployment:

```bash
kubectl get pods -n production
```

```
NAME                          READY   STATUS    RESTARTS   AGE
my-app-api-7d8f9c5b6d-xyz12   1/1     Running   0          30s
```

## What's Next?

### [🎯 Quick Start](/guide/quick-start)
5-minute tutorial to deploy a real app

### [📚 Configuration Guide](/guide/configuration)
Learn all configuration options

### [✨ Context Helpers](/guide/context-helpers)
Master the helper functions

### [🔒 Secrets](/guide/secrets)
Secure secret management

## Common Issues

### kubectl not found

Make sure kubectl is installed and in PATH:

```bash
kubectl version --client
```

### Docker not running

Start Docker:

```bash
docker ps
```

### TypeScript errors

Make sure TypeScript is installed:

```bash
pnpm add -D typescript
```

## Getting Help

- 📖 [Documentation](/guide/what-is-tsops)
- 💬 [GitHub Discussions](https://github.com/yourusername/tsops/discussions)
- 🐛 [Report Bug](https://github.com/yourusername/tsops/issues)
- 💡 [Feature Request](https://github.com/yourusername/tsops/issues/new?template=feature_request.md)


