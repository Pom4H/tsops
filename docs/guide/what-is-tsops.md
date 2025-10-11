# What is tsops?

**tsops** is a TypeScript-first toolkit for planning, building, and deploying applications to Kubernetes. It replaces YAML configurations with type-safe TypeScript code, giving you the power of a programming language while maintaining the simplicity of declarative configuration.

## The Problem

Deploying to Kubernetes traditionally involves:

- ❌ Writing repetitive YAML files
- ❌ Copying and pasting configurations
- ❌ Hardcoding service names, domains, and DNS
- ❌ Managing secrets separately from deployment
- ❌ No type safety or validation until runtime
- ❌ Difficult to maintain across environments

## The tsops Solution

tsops provides:

- ✅ **Type-safe configuration** - Catch errors at compile time
- ✅ **Context helpers** - serviceDNS(), network(), secret()
- ✅ **Single source of truth** - Define once, use everywhere
- ✅ **Secret validation** - Automatic checks before deployment
- ✅ **Built-in Docker** - Build and push images
- ✅ **Multi-environment** - Easy dev/staging/prod management

## How It Works

```typescript
// tsops.config.ts
import { defineConfig } from 'tsops'

export default defineConfig({
  project: 'my-app',
  domain: { prod: 'example.com' },
  
  apps: {
    api: {
      network: ({ domain }) => `api.${domain}`,
      env: ({ serviceDNS }) => ({
        DB_URL: serviceDNS('postgres', 5432)
      })
    }
  }
})
```

```bash
# Deploy
$ pnpm tsops deploy --namespace production
```

That's it! tsops:
1. Resolves your configuration
2. Builds Docker images (if needed)
3. Generates Kubernetes manifests
4. Applies them to your cluster

## Key Features

### 🎯 Type Safety

Write configuration in TypeScript with full IntelliSense support. Get instant feedback on typos and type errors.

### ✨ Context Helpers

Built-in helpers for common patterns:

```typescript
{
  serviceDNS('postgres', 5432)
  // → 'my-app-postgres.production.svc.cluster.local:5432'
  
  // Use namespace variables for domain
  network: ({ domain }) => `api.${domain}`
  // → 'api.example.com'
  
  secret('api-secrets')
  // → envFrom: secretRef
}
```

### 🔒 Secret Validation

Automatic validation before deployment:

```typescript
secrets: {
  'api-secrets': () => ({
    JWT_SECRET: process.env.PROD_JWT ?? ''  // ← Validated!
  })
}
```

If `PROD_JWT` is missing, tsops:
1. Checks if secret exists in cluster
2. Uses cluster secret if available
3. Shows helpful error if not

### 🚀 Single Source of Truth

Use the same config for deployment AND runtime:

```typescript
// Deployment
env: ({ secret }) => secret('api-secrets')

// Runtime (in your app)
import config from './tsops.config'
process.env.TSOPS_NAMESPACE = 'production'
const nodeEnv = config.env('api', 'NODE_ENV')
```

## Comparison

| Feature | YAML | Helm | tsops |
|---------|------|------|-------|
| Type Safety | ❌ | ❌ | ✅ |
| IntelliSense | ❌ | ❌ | ✅ |
| Functions | ❌ | Limited | ✅ |
| Validation | Runtime | Runtime | Compile-time |
| Secret Validation | ❌ | ❌ | ✅ |
| Context Helpers | ❌ | ❌ | ✅ |
| Learning Curve | Low | High | Medium |

## Who is tsops for?

tsops is perfect for:

- **TypeScript teams** - You already know the language
- **Platform engineers** - Managing multiple apps and environments
- **Startups** - Need to move fast with confidence
- **Teams tired of YAML** - Want type safety and better DX

## Next Steps

<div class="next-steps">

### [🚀 Get Started](/guide/getting-started)
Install tsops and deploy your first app

### [📖 Context Helpers](/guide/context-helpers)
Learn about configuration helpers and runtime utilities

### [💡 Examples](/examples/)
See real-world use cases

</div>

<style>
.next-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin: 2rem 0;
}

.next-steps > div {
  padding: 1.5rem;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
}
</style>
