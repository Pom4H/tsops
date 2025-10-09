# Namespace-Aware Deployment Workflow

## Overview

The new configuration system is namespace-aware, meaning the same service can be deployed to different namespaces with different URLs, environment variables, and settings. This solves the compile-time vs runtime configuration problem.

## Configuration Structure

```typescript
export default defineConfigV2({
  project: 'hyper-graph',
  
  namespaces: {
    dev: {
      domain: 'dev.hyper-graph.com',
      replicas: 1,
      debug: true,
      logLevel: 'debug'
    },
    staging: {
      domain: 'staging.hyper-graph.com',
      replicas: 2,
      debug: false,
      logLevel: 'info'
    },
    prod: {
      domain: 'hyper-graph.com',
      replicas: 3,
      debug: false,
      logLevel: 'warn'
    }
  },
  
  services: ({ domain, net, expose, res, depends }) => ({
    web: {
      kind: 'gateway',
      listen: net.http(8080),
      public: expose.httpsHost(domain),
      needs: [
        depends.on('api', 8080),
        depends.on('auth', 8081)
      ],
      resources: res.smol,
      description: 'Web gateway'
    }
  })
})
```

## Pruning for Different Namespaces

### Development Environment

```bash
tsops prune web --namespace dev
```

**Generated: `tsops.runtime.ts`**
```typescript
import { useConfig } from 'tsops'

export default useConfig({
  project: 'hyper-graph',
  namespace: 'dev',
  service: {
    name: 'web',
    internalUrl: 'http://hyper-graph-web.dev.svc.cluster.local:8080',
    externalUrl: 'https://dev.hyper-graph.com',
    // ...
  },
  dependencies: [
    {
      service: 'api',
      url: 'http://hyper-graph-api.dev.svc.cluster.local:8080',
      // ...
    }
  ],
  environment: {
    API_URL: { type: 'static', value: 'http://hyper-graph-api.dev.svc.cluster.local:8080' },
    DOMAIN: { type: 'static', value: 'dev.hyper-graph.com' },
    DEBUG: { type: 'static', value: 'true' },
    LOG_LEVEL: { type: 'static', value: 'debug' }
  },
  namespaceVars: {
    domain: 'dev.hyper-graph.com',
    replicas: 1,
    debug: true,
    logLevel: 'debug'
  }
})
```

### Production Environment

```bash
tsops prune web --namespace prod
```

**Generated: `tsops.runtime.ts`**
```typescript
import { useConfig } from 'tsops'

export default useConfig({
  project: 'hyper-graph',
  namespace: 'prod',
  service: {
    name: 'web',
    internalUrl: 'http://hyper-graph-web.prod.svc.cluster.local:8080',
    externalUrl: 'https://hyper-graph.com',
    // ...
  },
  dependencies: [
    {
      service: 'api',
      url: 'http://hyper-graph-api.prod.svc.cluster.local:8080',
      // ...
    }
  ],
  environment: {
    API_URL: { type: 'static', value: 'http://hyper-graph-api.prod.svc.cluster.local:8080' },
    DOMAIN: { type: 'static', value: 'hyper-graph.com' },
    DEBUG: { type: 'static', value: 'false' },
    LOG_LEVEL: { type: 'static', value: 'warn' }
  },
  namespaceVars: {
    domain: 'hyper-graph.com',
    replicas: 3,
    debug: false,
    logLevel: 'warn'
  }
})
```

## Runtime Usage

```typescript
import config from './tsops.runtime'

// The same code works with different configurations
const apiUrl = config.dependencyUrl('api')        // Namespace-aware URL
const domain = config.namespaceVar('domain')      // Namespace-specific domain
const debug = config.namespaceVar('debug')        // Namespace-specific debug flag
const logLevel = config.env('LOG_LEVEL')          // Namespace-specific log level

console.log(`API URL: ${apiUrl}`)
console.log(`Domain: ${domain}`)
console.log(`Debug: ${debug}`)
console.log(`Log Level: ${logLevel}`)
```

## Deployment Workflow

### 1. Build Once, Deploy Everywhere

```bash
# Build the image once
docker build -t hyper-graph-web:latest .

# Tag for different environments
docker tag hyper-graph-web:latest hyper-graph-web:dev
docker tag hyper-graph-web:latest hyper-graph-web:staging
docker tag hyper-graph-web:latest hyper-graph-web:prod
```

### 2. Generate Runtime Configs

```bash
# Generate runtime config for each environment
tsops prune web --namespace dev --output src/runtime/dev.ts
tsops prune web --namespace staging --output src/runtime/staging.ts
tsops prune web --namespace prod --output src/runtime/prod.ts
```

### 3. Deploy to Different Namespaces

```bash
# Deploy to dev
kubectl apply -f k8s/dev/

# Deploy to staging
kubectl apply -f k8s/staging/

# Deploy to prod
kubectl apply -f k8s/prod/
```

## Benefits

### 1. **Compile-time vs Runtime Problem Solved**
- **Before**: Couldn't know API_URL at compile time
- **After**: API_URL is resolved at prune time based on namespace

### 2. **Same Image, Different Configurations**
- One Docker image works for all environments
- Different runtime configurations for different namespaces
- No need to rebuild for different environments

### 3. **Namespace-aware URLs**
- `dev`: `http://hyper-graph-api.dev.svc.cluster.local:8080`
- `staging`: `http://hyper-graph-api.staging.svc.cluster.local:8080`
- `prod`: `http://hyper-graph-api.prod.svc.cluster.local:8080`

### 4. **Environment-specific Variables**
- Debug flags, log levels, replica counts
- All resolved at prune time, not runtime

### 5. **Type Safety**
- TypeScript knows about all available namespace variables
- IDE autocomplete for dependency URLs
- Compile-time validation of service references

## CI/CD Integration

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main, develop]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build image
        run: docker build -t hyper-graph-web:${{ github.sha }} .
      
      - name: Generate runtime configs
        run: |
          tsops prune web --namespace dev --output src/runtime/dev.ts
          tsops prune web --namespace staging --output src/runtime/staging.ts
          tsops prune web --namespace prod --output src/runtime/prod.ts
      
      - name: Deploy to dev
        if: github.ref == 'refs/heads/develop'
        run: |
          kubectl apply -f k8s/dev/
      
      - name: Deploy to prod
        if: github.ref == 'refs/heads/main'
        run: |
          kubectl apply -f k8s/prod/
```

## Migration from v1

### Before (v1)
```typescript
// Couldn't know API_URL at compile time
const apiUrl = process.env.API_URL // undefined at compile time
```

### After (v2)
```typescript
// API_URL is resolved at prune time
const apiUrl = config.dependencyUrl('api') // http://hyper-graph-api.dev.svc.cluster.local:8080
```

This approach solves the fundamental problem of not being able to know service URLs at compile time while maintaining the flexibility of deploying the same image to different environments.