# Getting Started

Get up and running with tsops in minutes.

## Prerequisites

- Node.js 20+ or 22 LTS, **or** Bun 1.1+
- Docker (for building images)
- kubectl configured with cluster access
- TypeScript 5.x

## Installation

::: code-group

```bash [pnpm]
pnpm add tsops
```

```bash [bun]
bun add tsops
```

```bash [npm]
npm install tsops
```

:::

> tsops itself is runtime-agnostic — the CLI runs on either Node.js or Bun.
> Pick whichever your project already uses.

## Create Configuration

Create `tsops.config.ts` in your project root:

```typescript
import { defineConfig } from 'tsops'

export default defineConfig({
  project: 'my-app',
  
  namespaces: {
    production: {
      domain: 'example.com',
      production: true,
      replicas: 3
    },
    dev: {
      domain: 'dev.example.com',
      production: false,
      replicas: 1
    }
  },
  
  clusters: {
    production: {
      apiServer: 'https://your-k8s-api.com:6443',
      context: 'production',
      namespaces: ['production', 'dev']
    }
  },
  
  images: {
    registry: 'ghcr.io/example',
    tagStrategy: 'git-sha'
  },
  
  apps: {
    api: {
      build: {
        type: 'dockerfile',
        context: './api',
        dockerfile: './api/Dockerfile'
      },
      
      ingress: ({ domain }) => ({ domain: `api.${domain}` }),
      
      ports: [{ name: 'http', port: 80, targetPort: 8080 }],
      
      env: ({ production }) => ({
        NODE_ENV: production ? 'production' : 'development'
        // ✅ In your app: config.url('postgres', 'service')
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

## Use the config from your app

The same `tsops.config.ts` is consumed by your application code at runtime. This is the differentiator — not just typed manifests, but a typed operational model your app actually imports.

```ts
// apps/api/src/index.ts
import config from '../../tsops.config'

// Service-to-service URL, namespace-aware
const dbUrl = config.url('postgres', 'service')

// Resolved env value for this app
const nodeEnv = config.env('api', 'NODE_ENV')
```

`TSOPS_NAMESPACE` selects the active namespace at runtime. Same code runs in `prod`, in a `pr-857` preview namespace, and locally.

## Deploy Your App

### Step 1: Plan

See what will be deployed:

```bash
pnpm tsops plan
```

Sample output:
```
📋 Generating deployment plan and validating manifests...

🌐 Global Resources

   ➕ Namespaces to create:
      • production

────────────────────────────────────────────

📦 Application Resources

   api @ production (api.example.com)
   Image: ghcr.io/example/api:abc123

      ➕ Will create:
         • Deployment/my-app-api
         • Service/my-app-api
         • Ingress/my-app-api

────────────────────────────────────────────
✅ Validation passed. Run "tsops deploy" to apply these changes.
```

Tip: add `--dry-run` to preview the plan without contacting Docker or kubectl.

### Step 2: Build

Build Docker images:

```bash
pnpm tsops build
```

### Step 3: Deploy

Deploy applications:

```bash
pnpm tsops deploy --namespace production
```

Sample output:
```
✅ Deployed applications:

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
Deploy a complete demo in five minutes

### [✨ Context Helpers](/guide/context-helpers)
Master the helper functions available inside app definitions

### [🔒 Secrets & ConfigMaps](/guide/secrets)
Secure secret management with automatic validation

### [📖 What is tsops?](/guide/what-is-tsops)
Understand the architecture and problem space

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
- 💬 [GitHub Discussions](https://github.com/Pom4H/tsops/discussions)
- 🐛 [Report Bug](https://github.com/Pom4H/tsops/issues)
- 💡 [Feature Request](https://github.com/Pom4H/tsops/issues/new)
