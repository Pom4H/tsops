# Context Helpers

Context helpers are built-in functions available in all app configuration functions. They help you write clean, DRY configuration without hardcoding values.

## Overview

All context helpers are automatically available in app configuration functions:

```typescript
apps: {
  api: {
    env: ({ dns, secret, appName, production }) => ({
      // Use helpers here
      NODE_ENV: production ? 'production' : 'development',
      SERVICE_NAME: appName,
      DB_URL: dns('postgres', 5432),
      JWT_SECRET: secret('api-secrets', 'JWT_SECRET')
    })
  }
}
```

**Note:** Use explicit namespace variables (like `production`, `dev`, etc.) instead of auto-detected flags.

---

## Metadata

Information about the current context.

### `project: string`

Current project name from config.

```typescript
env: ({ project }) => ({
  PROJECT_NAME: project  // -> 'my-project'
})
```

### `namespace: string`

Current namespace name.

```typescript
env: ({ namespace }) => ({
  NAMESPACE: namespace  // -> 'production' or 'dev'
})
```

### `appName: string`

Current application name being configured.

```typescript
env: ({ appName }) => ({
  SERVICE_NAME: appName,  // -> 'api', 'frontend', etc.
  INSTANCE_ID: `${appName}-${Date.now()}`
})
```

### `cluster: ClusterMetadata`

Current cluster information.

```typescript
interface ClusterMetadata {
  name: string        // Cluster name
  apiServer: string   // API server URL
  context: string     // Kubectl context
}
```

```typescript
env: ({ cluster }) => ({
  CLUSTER_NAME: cluster.name,
  K8S_API: cluster.apiServer
})
```

---

## Generators

Functions that generate names and DNS entries.

### `dns(app, options?)`

Generate Kubernetes service DNS name with support for protocols, ports, headless services, and external services.

#### Signature

```typescript
dns(app: string, options?: number | DNSOptions): string

interface DNSOptions {
  port?: number
  protocol?: 'http' | 'https' | 'tcp' | 'udp'
  headless?: boolean      // For StatefulSets
  podIndex?: number       // Pod index for headless service
  external?: boolean      // External service (no cluster domain)
  clusterDomain?: string  // Default: 'cluster.local'
}
```

#### Examples

**Simple usage (backward compatible):**

```typescript
env: ({ dns }) => ({
  // Without port
  POSTGRES_HOST: dns('postgres'),
  // -> 'my-project-postgres.production.svc.cluster.local'
  
  // With port (shorthand)
  POSTGRES_URL: dns('postgres', 5432),
  // -> 'my-project-postgres.production.svc.cluster.local:5432'
})
```

**With protocol:**

```typescript
env: ({ dns }) => ({
  API_URL: dns('api', { port: 3000, protocol: 'https' }),
  // -> 'https://my-project-api.production.svc.cluster.local:3000'
  
  REDIS_URL: dns('redis', { port: 6379, protocol: 'tcp' }),
  // -> 'tcp://my-project-redis.production.svc.cluster.local:6379'
})
```

**Headless service (StatefulSet):**

```typescript
env: ({ dns }) => ({
  // Specific pod
  POSTGRES_MASTER: dns('postgres', { 
    headless: true, 
    podIndex: 0 
  }),
  // -> 'my-project-postgres-0.my-project-postgres.production.svc.cluster.local'
  
  // Service (all pods)
  POSTGRES_SERVICE: dns('postgres', { headless: true }),
  // -> 'my-project-postgres.production.svc.cluster.local'
})
```

**External service:**

```typescript
env: ({ dns }) => ({
  EXTERNAL_API: dns('api.external.com', { 
    external: true,
    protocol: 'https',
    port: 443
  }),
  // -> 'https://api.external.com:443'
})
```

**Custom cluster domain:**

```typescript
env: ({ dns }) => ({
  SERVICE_URL: dns('api', { port: 3000, clusterDomain: 'custom.local' }),
  // -> 'my-project-api.production.svc.custom.local:3000'
})
```

#### Pattern

```
[protocol://]{project}-{app}.{namespace}.svc.{clusterDomain}[:port]
```

For headless with podIndex:
```
[protocol://]{project}-{app}-{podIndex}.{project}-{app}.{namespace}.svc.{clusterDomain}[:port]
```

For external:
```
[protocol://]{app}[:port]
```

---

### `label(key, value?)`

Generate Kubernetes label selector following best practices.

#### Signature

```typescript
label(key: string, value?: string): string
```

#### Examples

```typescript
env: ({ label }) => ({
  // Auto-generated value (project-app)
  APP_LABEL: label('name'),
  // -> 'app.kubernetes.io/name=my-project-api'
  
  // Custom value
  COMPONENT_LABEL: label('component', 'database'),
  // -> 'app.kubernetes.io/component=database'
  
  TIER_LABEL: label('tier', 'backend')
  // -> 'app.kubernetes.io/tier=backend'
})
```

#### Pattern

```
app.kubernetes.io/{key}={value || project-appName}
```

---

### `resource(kind, name)`

Generate resource name following project conventions.

#### Signature

```typescript
resource(kind: ResourceKind, name: string): string

type ResourceKind = 'secret' | 'configmap' | 'pvc' | 'sa' | 'serviceaccount'
```

#### Examples

```typescript
env: ({ resource }) => ({
  SECRET_NAME: resource('secret', 'api-keys'),
  // -> 'my-project-api-api-keys'
  
  PVC_NAME: resource('pvc', 'data'),
  // -> 'my-project-api-data'
  
  SA_NAME: resource('sa', 'worker'),
  // -> 'my-project-api-worker'
})
```

#### Pattern

```
{project}-{appName}-{name}[-{kind}]
```

Note: ServiceAccount (sa) doesn't include kind suffix.

---

## Secrets & ConfigMaps

Functions for referencing secrets and config maps in environment variables.

### `secret(secretName)`

Reference entire secret as envFrom (all keys become environment variables).

```typescript
env: ({ secret }) => secret('api-secrets')
// Generates: envFrom: [{ secretRef: { name: 'api-secrets' } }]
```

### `secret(secretName, key)`

Reference specific key from secret as valueFrom.

```typescript
env: ({ secret }) => ({
  JWT_SECRET: secret('api-secrets', 'JWT_SECRET'),
  API_KEY: secret('api-secrets', 'API_KEY')
})
// Generates:
// env:
//   - name: JWT_SECRET
//     valueFrom:
//       secretKeyRef:
//         name: api-secrets
//         key: JWT_SECRET
```

### `configMap(configMapName)`

Reference entire configMap as envFrom.

```typescript
env: ({ configMap }) => configMap('api-config')
// Generates: envFrom: [{ configMapRef: { name: 'api-config' } }]
```

### `configMap(configMapName, key)`

Reference specific key from configMap.

```typescript
env: ({ configMap }) => ({
  LOG_LEVEL: configMap('api-config', 'LOG_LEVEL'),
  FEATURE_FLAGS: configMap('api-config', 'FEATURES')
})
```

### Type Safety

Secret and ConfigMap names are type-safe based on your declarations:

```typescript
export default defineConfig({
  secrets: {
    'api-secrets': { /* ... */ },
    'db-secrets': { /* ... */ }
  },
  
  apps: {
    api: {
      env: ({ secret }) => ({
        // ✅ Type-safe: 'api-secrets' is recognized
        JWT: secret('api-secrets', 'JWT_SECRET'),
        
        // ❌ Type error: 'unknown-secret' doesn't exist
        // KEY: secret('unknown-secret', 'KEY')
      })
    }
  }
})
```

---

## Utilities

Helper functions for common tasks.

### `env(key, fallback?)`

Get environment variable with optional fallback.

#### Signature

```typescript
env<T extends string = string>(key: string, fallback?: T): T
```

#### Examples

```typescript
apps: {
  api: {
    env: ({ env, production }) => ({
      // Required in production, fallback in dev
      JWT_SECRET: env('JWT_SECRET', production ? undefined : 'dev-jwt-secret'),

      // Always has fallback
      DEBUG: env('DEBUG', 'false'),

      // Optional
      SENTRY_DSN: env('SENTRY_DSN')
    })
  }
}
```

#### Pattern

Returns `process.env[key]` if set, otherwise returns `fallback` (or empty string if no fallback).

---

### `template(str, vars)`

Simple template string helper for complex string generation.

#### Signature

```typescript
template(str: string, vars: Record<string, string>): string
```

#### Examples

```typescript
env: ({ template, dns }) => ({
  // Database URL
  DATABASE_URL: template('postgresql://{user}:{pass}@{host}:{port}/{db}', {
    user: 'admin',
    pass: 'secret',
    host: dns('postgres'),
    port: '5432',
    db: 'myapp'
  }),
  // -> 'postgresql://admin:secret@my-project-postgres.prod.svc.cluster.local:5432/myapp'
  
  // API endpoint
  API_ENDPOINT: template('https://{domain}/api/v{version}', {
    domain: 'example.com',
    version: '1'
  }),
  // -> 'https://example.com/api/v1'
})
```

#### Pattern

Replaces `{key}` with corresponding value from `vars` object. Missing keys are replaced with empty string.

---

## Complete Example

```typescript
import { defineConfig } from 'tsops'

export default defineConfig({
  project: 'my-app',
  
  namespaces: {
    prod: {
      domain: 'example.com',
      production: true,
      replicas: 3,
      dbHost: 'prod-db.internal'
    },
    dev: {
      domain: 'dev.example.com',
      production: false,
      replicas: 1,
      dbHost: 'dev-db.internal'
    }
  },
  
  clusters: { /* ... */ },
  images: { /* ... */ },
  
  secrets: {
    'app-secrets': ({ production }) => ({
      JWT_SECRET: production
        ? process.env.JWT_SECRET ?? ''
        : 'dev-secret',
      API_KEY: process.env.API_KEY ?? ''
    })
  },
  
  apps: {
    api: {
      network: ({ domain }) => `api.${domain}`,
      
      env: ({
        // Metadata
        project,
        namespace,
        appName,
        cluster,
        
        // Generators
        dns,
        label,
        resource,
        
        // Secrets & ConfigMaps
        secret,
        configMap,
        
        // Utilities
        env,
        template,
        
        // Namespace variables
        production,
        dbHost,
        replicas,
        domain
      }) => ({
        // Metadata
        PROJECT: project,
        NAMESPACE: namespace,
        SERVICE_NAME: appName,
        CLUSTER: cluster.name,
        
        // Namespace variables
        NODE_ENV: production ? 'production' : 'development',
        DEBUG: production ? 'false' : 'true',
        
        // Service DNS
        REDIS_URL: dns('redis', 6379),
        POSTGRES_URL: dns('postgres', {
          port: 5432,
          protocol: 'postgresql' as any
        }),
        
        // Secrets
        JWT_SECRET: secret('app-secrets', 'JWT_SECRET'),
        
        // Template
        DATABASE_URL: template('postgresql://{host}:{port}/myapp', {
          host: dns('postgres'),
          port: '5432'
        }),
        
        // Namespace variables
        DB_HOST: dbHost,
        WORKER_COUNT: String(replicas * 2),
        
        // Labels & Resources
        APP_LABEL: label('name'),
        DATA_VOLUME: resource('pvc', 'data')
      })
    }
  }
})
```

---

## Migration from v4

### Removed Helpers

**`serviceName(app)` - REMOVED**

Too simple. Use template string directly:

```typescript
// ❌ Old
serviceName: (app) => `${project}-${app}`

// ✅ New
`${project}-${app}`
```

**`secretKey(name, key)` - REMOVED**

Merged into `secret()`:

```typescript
// ❌ Old
env: ({ secretKey }) => ({
  JWT: secretKey('api-secrets', 'JWT_SECRET')
})

// ✅ New
env: ({ secret }) => ({
  JWT: secret('api-secrets', 'JWT_SECRET')
})
```

**`configMapKey(name, key)` - REMOVED**

Merged into `configMap()`:

```typescript
// ❌ Old
env: ({ configMapKey }) => ({
  CONFIG: configMapKey('api-config', 'app.json')
})

// ✅ New
env: ({ configMap }) => ({
  CONFIG: configMap('api-config', 'app.json')
})
```

### Simplified API

The secret/configMap functions now support both use cases with a cleaner API:

```typescript
// Reference entire secret/configMap (envFrom)
env: ({ secret }) => secret('api-secrets')

// Reference specific key (valueFrom)
env: ({ secret }) => ({
  JWT: secret('api-secrets', 'JWT_SECRET')
})
```
