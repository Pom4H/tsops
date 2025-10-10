# DX Improvements - Smart DSL

## Problem

Original syntax was verbose and not intuitive:

```typescript
services: (h) => h.validate.noCycles({
  api: {
    public: {
      ns: 'ai-prod',
      host: h.hostFor('ai-prod', 'api'),
      basePath: h.path('/v1')
    },
    listen: { kind: 'http', protocol: 'https', port: port(443) },
    needs: ['db']
  }
})
```

**Issues:**
- ❌ Requires function wrapper `(h) =>`
- ❌ Explicit `h.validate.noCycles()` call
- ❌ Verbose `h.hostFor()`, `h.path()` calls
- ❌ Complex `public` object structure
- ❌ Manual `listen` configuration

## Solution: Smart DSL

Three progressively simpler syntaxes:

### 1. Declarative (Recommended) ⭐

```typescript
import { smart, resolve } from '@tsops/core'

const config = smart({
  project: 'worken',
  regions: { ai: fqdn('worken.ai') },
  namespaces: { 'ai-prod': { region: 'ai' } },
  clusters: { /* ... */ },

  // Just describe what you want!
  services: {
    api: {
      namespace: 'ai-prod',  // Which namespace
      subdomain: 'api',      // Which subdomain
      path: '/v1',           // Path
      port: 443,             // Port
      protocol: 'https',     // Protocol
      needs: ['db']          // Dependencies (auto-validated!)
    }
  }
})

const resolved = resolve(config)
console.log(resolved.services.api.public?.host)  // 'api.worken.ai'
```

**Benefits:**
- ✅ No function wrapper
- ✅ No explicit validation calls (automatic)
- ✅ Declarative: just describe your infrastructure
- ✅ Auto-generates hosts from namespace + subdomain
- ✅ Shorthand: `port + protocol` instead of `listen` object

### 2. With $ Helper (for complex cases)

```typescript
services: $ => ({
  api: {
    host: $('ai-prod', 'api'),  // Short helper
    path: $.path('/v1'),
    needs: ['db']
  }
}),

env: $ => ({
  DATABASE_URL: $.secret('db', 'url'),
  API_URL: $.url('https', $('ai-prod', 'api'), '/v1')
})
```

**Benefits:**
- ✅ Concise `$()` instead of `h.hostFor()`
- ✅ `$.path()`, `$.url()`, `$.secret()` - clear and short
- ✅ Still type-safe

### 3. Template Syntax (experimental)

```typescript
services: {
  api: {
    host: '@ai-prod/api',  // Template: automatically parsed!
    path: '/v1'
  }
}
```

**Benefits:**
- ✅ Ultra-concise template strings
- ✅ Self-documenting: clear namespace + subdomain
- ✅ Type-safe parsing

## Comparison

| Feature | Old API | Smart API |
|---------|---------|-----------|
| **Function wrapper** | Required `(h) =>` | Optional |
| **Validation** | Explicit `h.validate.noCycles()` | Automatic |
| **Host generation** | `h.hostFor('ns', 'sub')` | `namespace + subdomain` or `$('ns', 'sub')` |
| **Path creation** | `h.path('/v1')` | `'/v1'` or `$.path('/v1')` |
| **Listen config** | `{ kind, protocol, port }` | `port + protocol` |
| **Cycles detection** | Manual call | Automatic |
| **Lines of code** | ~15 lines per service | ~7 lines per service |

## Smart Features

### Auto-Validation

No need to call validators explicitly:

```typescript
// OLD: Manual validation
services: (h) => h.validate.noCycles({ ... })

// NEW: Automatic
services: { ... }  // Validated automatically on resolve()
```

### Smart Host Resolution

Multiple ways to specify hosts:

```typescript
// 1. Namespace + subdomain (recommended)
{ namespace: 'ai-prod', subdomain: 'api' }
// → 'api.worken.ai'

// 2. Template syntax
{ host: '@ai-prod/api' }
// → 'api.worken.ai'

// 3. $ helper
host: $('ai-prod', 'api')
// → 'api.worken.ai'

// 4. Full override
{ host: 'custom.example.com' }
// → 'custom.example.com'
```

### Shorthand Syntax

```typescript
// OLD: Verbose
listen: {
  kind: 'http',
  protocol: 'https',
  port: port(443)
}

// NEW: Concise
port: 443,
protocol: 'https'
```

## Migration Guide

### Before (Original API)

```typescript
import { defineDSL, fqdn, port, path } from '@tsops/core'

const config = defineDSL({
  project: 'worken',
  regions: { ai: fqdn('worken.ai') },
  namespaces: { 'ai-prod': { region: 'ai' } },
  
  services: (h) => h.validate.noCycles({
    api: {
      expose: 'public',
      listen: { kind: 'http', protocol: 'https', port: port(443) },
      needs: ['db'],
      public: {
        ns: 'ai-prod',
        host: h.hostFor('ai-prod', 'api'),
        basePath: h.path('/v1')
      }
    }
  }),
  
  env: (h) => ({
    ...h.env.require('DATABASE_URL', {
      scope: 'runtime',
      kind: 'url',
      secretRef: h.secretRef('db', 'url')
    })
  })
})
```

### After (Smart API)

```typescript
import { smart, resolve, fqdn } from '@tsops/core'

const config = smart({
  project: 'worken',
  regions: { ai: fqdn('worken.ai') },
  namespaces: { 'ai-prod': { region: 'ai' } },
  
  services: {
    api: {
      namespace: 'ai-prod',
      subdomain: 'api',
      path: '/v1',
      port: 443,
      protocol: 'https',
      needs: ['db']
    }
  },
  
  env: {
    DATABASE_URL: {
      required: true,
      scope: 'runtime',
      kind: 'url',
      secretRef: 'secret://db/url'
    }
  }
})

const resolved = resolve(config)
```

**Reduction:**
- 📉 50% less code
- 📉 No function wrappers
- 📉 No explicit helper calls
- ✨ Same type safety
- ✨ Better readability

## Type Safety

All type safety is preserved:

```typescript
const config = smart({
  namespaces: { 'ai-prod': { region: 'ai' } },
  
  services: {
    api: {
      namespace: 'unknown',  // ❌ Type error: namespace doesn't exist
      subdomain: 'api'
    }
  }
})
```

```typescript
services: {
  a: { needs: ['b'] },
  b: { needs: ['a'] }  // ❌ Runtime error: cycle detected
}
```

## API Reference

### `smart(config)`

Define configuration with smart syntax.

```typescript
const config = smart({
  project: string,
  regions: Regions,
  namespaces: Namespaces,
  clusters: Clusters,
  services: SmartServices | (($ ) => SmartServices),
  env?: EnvSpec | (($) => EnvSpec),
  ingress?: IngressRule[] | (($) => IngressRule[])
})
```

### `resolve(config)`

Resolve smart config to full config.

```typescript
const resolved = resolve(config)
// Returns: { project, regions, namespaces, clusters, services, env, ingress }
```

### Short Helper `$`

When using function syntax:

- `$(namespace, subdomain)` - generate host
- `$.path(p)` - create path
- `$.url(protocol, host, path)` - create URL
- `$.secret(namespace, key)` - create secret reference
- `$.full` - access full helpers if needed

## Examples

See `/examples/dynamic-dsl-smart/tsops.config.ts` for complete examples of all three styles.

## Backwards Compatibility

The original API (`defineDSL`, `resolveDSL`) is still available and fully supported. Smart API is an addition, not a replacement.

```typescript
// Both work:
import { defineDSL } from '@tsops/core'  // Original
import { smart } from '@tsops/core'      // Smart (new)
```
