# Dynamic Infrastructure DSL

**Philosophy: "Type is a Rule" — Infrastructure as a Typed Domain Model**

This DSL transforms infrastructure configuration into a living, type-safe model where:
- **Facts** are defined once (regions, namespaces, clusters)
- **Invariants** are computed at the type level (valid FQDNs, hosts, paths, URLs)
- **Dynamic sections** use typed helpers that know everything about your infrastructure
- **Errors** are caught at compile time, before any deployment

## Architecture

```
Facts (Core)
    ↓
Type-Level Derivations (Invariants)
    ↓
Typed Helpers (Builders)
    ↓
Dynamic Sections (services, env, ingress)
```

## Key Concepts

### 1. Semantic Brands

Instead of plain strings, we use **branded types** that carry semantic meaning:

```typescript
type FQDN = Brand<`${string}.${string}`, 'FQDN'>  // 'example.com'
type Host = Brand<`${string}.${string}`, 'Host'>  // 'api.example.com'
type Path = Brand<`/${string}`, 'Path'>           // '/api/v1'
type Port<N> = Brand<N, 'Port'>                   // 443
type Url = Brand<`${protocol}://${host}${path}`, 'URL'>
```

This prevents accidental mixing: you can't use a `Path` where `Host` is expected.

### 2. Facts → Invariants

Define minimal **primary facts**:

```typescript
const config = defineDSL({
  project: 'worken',
  
  regions: {
    ai: fqdn('worken.ai'),
    ru: fqdn('worken.ru')
  },
  
  namespaces: {
    'ai-prod': { region: 'ai' },
    'ru-prod': { region: 'ru' }
  },
  
  clusters: {
    'k8s-main': {
      apiServer: 'https://k8s.example.com:6443',
      context: 'k8s-main',
      namespaces: ['ai-prod', 'ru-prod'] as const
    }
  },
  
  // ... dynamic sections below
})
```

From these facts, the type system **computes**:
- Which FQDN belongs to which namespace (via region)
- Valid hosts for each namespace: `${subdomain}.${region_fqdn}`
- Which clusters can deploy which namespaces

### 3. Dynamic Sections with Typed Helpers

Late sections (`services`, `env`, `ingress`) can be **functions** that receive typed helpers:

```typescript
services: (h) => h.validate.noCycles({
  api: {
    expose: 'public',
    listen: { kind: 'http', protocol: 'https', port: port(443) },
    needs: ['db'] as const,
    public: {
      ns: 'ai-prod',
      host: h.hostFor('ai-prod', 'api'),  // Type-safe!
      basePath: h.path('/v1')
    }
  },
  db: {
    expose: 'cluster',
    listen: { kind: 'tcp', port: port(5432) }
  }
})
```

**What TypeScript knows:**
- `h.hostFor('ai-prod', 'api')` returns `'api.worken.ai'` (computed from regions)
- `h.path('/v1')` ensures leading slash
- `h.validate.noCycles` prevents circular dependencies
- If you reference unknown namespace, **compile error**

### 4. Built-in Validators

Type-level validators enforce architectural rules:

#### No Cycles in Dependencies
```typescript
h.validate.noCycles({
  a: { needs: ['b'] },
  b: { needs: ['a'] }  // ❌ Type error: cycle detected!
})
```

#### Distinct Hosts
```typescript
h.validate.distinctHosts({
  'ns1': { api: 'api.example.com', web: 'web.example.com' },
  'ns2': { api: 'api.example.com' }  // ❌ Duplicate!
})
```

#### Ingress TLS Policy
```typescript
h.validate.ingress([{
  ns: 'prod',
  host: 'api.example.com',
  tls: {
    policy: 'letsencrypt',
    secretName: 'custom'  // ❌ letsencrypt can't have secretName!
  },
  paths: [h.path('/')]
}])
```

#### Required Secrets in Prod
```typescript
env: (h) => {
  const vars = {
    ...h.env.require('DATABASE_URL', {
      scope: 'runtime',
      kind: 'url',
      secretRef: h.secretRef('db', 'url')  // ✅ Required + secretRef
    }),
    ...h.env.optional('DEBUG', {
      scope: 'runtime',
      devDefault: 'false'
    })
  }
  
  // Type check: all required vars must have secretRef
  type _Check = RequireSecretsInProd<typeof vars>
  
  return vars
}
```

## Usage Example

```typescript
import { defineDSL, fqdn, port, path } from '@tsops/core/dsl'

const cfg = defineDSL({
  project: 'myapp',
  
  regions: {
    us: fqdn('example.com'),
    eu: fqdn('example.eu')
  },
  
  namespaces: {
    'us-prod': { region: 'us' },
    'us-stage': { region: 'us' },
    'eu-prod': { region: 'eu' }
  },
  
  clusters: {
    'k8s-us': {
      apiServer: 'https://k8s-us.internal:6443',
      context: 'k8s-us',
      namespaces: ['us-prod', 'us-stage'] as const
    },
    'k8s-eu': {
      apiServer: 'https://k8s-eu.internal:6443',
      context: 'k8s-eu',
      namespaces: ['eu-prod'] as const
    }
  },
  
  services: (h) => h.validate.noCycles({
    api: {
      expose: 'public',
      listen: { kind: 'http', protocol: 'https', port: port(443) },
      needs: ['db', 'cache'] as const,
      public: {
        ns: 'us-prod',
        host: h.hostFor('us-prod', 'api'),
        basePath: h.path('/')
      }
    },
    
    web: {
      expose: 'public',
      listen: { kind: 'http', protocol: 'https', port: port(443) },
      needs: ['api'] as const,
      public: {
        ns: 'us-prod',
        host: h.hostFor('us-prod', 'app'),
        basePath: h.path('/')
      }
    },
    
    db: {
      expose: 'cluster',
      listen: { kind: 'tcp', port: port(5432) }
    },
    
    cache: {
      expose: 'cluster',
      listen: { kind: 'tcp', port: port(6379) }
    }
  }),
  
  env: (h) => {
    const base = {
      ...h.env.require('DATABASE_URL', {
        scope: 'runtime',
        kind: 'url',
        secretRef: h.secretRef('db', 'url')
      }),
      ...h.env.require('REDIS_URL', {
        scope: 'runtime',
        kind: 'url',
        secretRef: h.secretRef('cache', 'url')
      }),
      ...h.env.optional('LOG_LEVEL', {
        scope: 'runtime',
        devDefault: 'info'
      })
    }
    
    // Auto-generate NEXT_PUBLIC_* for public services
    const publicVars = h.env.nextPublicFor({
      api: { public: { host: 'api.example.com', basePath: '/' as any } },
      web: { public: { host: 'web.example.com', basePath: '/' as any } }
    })
    
    return { ...base, ...publicVars }
  },
  
  ingress: (h) => h.validate.ingress([
    {
      ns: 'us-prod',
      host: h.hostFor('us-prod', 'api'),
      tls: { policy: 'letsencrypt' },
      paths: [h.path('/'), h.path('/api')]
    },
    {
      ns: 'us-prod',
      host: h.hostFor('us-prod', 'app'),
      tls: { policy: 'letsencrypt' },
      paths: [h.path('/')]
    }
  ])
})

// Resolve dynamic sections
const resolved = resolveDSL(cfg)

// Get endpoints
const apiUrl = getExternalEndpoint(resolved, 'api')  // 'https://api.example.com/'
const dbInternal = getInternalEndpoint(resolved, 'db', 'us-prod')  // 'db.us-prod.svc.cluster.local'
```

## What This Prevents

✅ **Compile-time guarantees:**
- Invalid namespace references
- Wrong FQDN for namespace
- Paths without leading `/`
- Circular service dependencies
- Missing secretRefs for required env vars
- Duplicate hosts across namespaces
- Invalid TLS configurations

✅ **IDE superpowers:**
- Autocomplete for valid namespaces
- Autocomplete for region-specific domains
- Inline type errors before running any code
- Jump to definition for services/namespaces

## Extensibility

Add custom validators by extending the DSL:

```typescript
// Custom validator: ensure all production services have resource limits
type RequireResourceLimits<S extends Services, Env extends string> = 
  Env extends 'prod'
    ? { [K in keyof S]: S[K] & { resources: { limits: any } } }
    : S

// Use in helpers
validate: {
  production: <S extends Services>(s: S, env: string) => 
    RequireResourceLimits<S, typeof env>
}
```

## Performance Considerations

- Use `as const` on literal objects (regions, namespaces)
- Break large unions into smaller validators
- Call validators at usage site, not globally
- Avoid deep recursive types (use helpers for composition)

## Benefits

1. **Type as Documentation**: Types describe the domain, not just data shapes
2. **Fail Fast**: Catch errors in IDE, not in CI/CD
3. **Refactoring Safety**: Rename a region? TypeScript finds all usages
4. **Zero Runtime Overhead**: All validation happens at compile time
5. **Progressive Disclosure**: Start simple, add validators as needed

---

This is infrastructure-as-code where the **compiler is your first reviewer**.
