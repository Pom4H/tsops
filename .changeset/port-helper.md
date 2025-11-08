---
'@tsops/core': minor
'tsops': minor
---

## Features

### 🎯 Explicit Local Development Mode

Added explicit `local: boolean` flag to namespace configuration for clearer local development semantics.

**Problem:**
Previously, local mode was implicitly detected by checking if domain contains `localhost`. This was unclear and error-prone.

**Solution:**
Explicit `local` flag in namespace configuration:

```typescript
export default defineConfig({
  namespaces: {
    dev: { 
      local: true,  // 🎯 Explicit local mode!
      domain: 'dev.example.com',
      replicas: 1
    },
    prod: { 
      local: false,  // or omit (defaults to false)
      domain: 'example.com',
      replicas: 3
    }
  }
})
```

**What happens in local mode (`local: true`):**
- ✅ `config.url('app', 'service')` → `http://localhost:3001` (not `http://app-name`)
- ✅ `config.dns('app', 'service')` → `localhost` (not `app-name`)
- ✅ Service-to-service calls work without Kubernetes DNS
- ✅ Each service gets unique port via `targetPort` configuration

**Example:**

```typescript
// Dev namespace with local: true
export default defineConfig({
  namespaces: {
    dev: { local: true, domain: 'localhost' }
  },
  apps: {
    api: {
      ports: [{ name: 'http', port: '80:3001' }],
      env: ({ url }) => ({
        DATABASE_URL: url('database', 'service')  // http://localhost:5432
      })
    },
    database: {
      ports: [{ name: 'tcp', port: '5432:5432' }]
    }
  }
})
```

In dev (`local: true`):
- `config.url('api', 'service')` → `http://localhost:3001` ✅
- `config.url('database', 'service')` → `http://localhost:5432` ✅

In prod (`local: false`):
- `config.url('api', 'service')` → `http://api` ✅
- `config.url('database', 'service')` → `http://database` ✅

**Benefits:**
1. **Explicit & Clear**: No magic domain detection
2. **Type-Safe**: Part of namespace definition
3. **Works with Any Domain**: Not tied to "localhost" string
4. **Correct DNS Resolution**: Service URLs work in local dev without K8s

---

### Added `port()` Runtime Helper

New `port()` helper provides a single source of truth for application ports. Applications can now query their own port configuration at runtime, enabling dynamic port assignment based on namespace.

**Problem:**
Previously, port configuration lived in tsops config, but applications had no way to know what port they should listen on. This led to hardcoded ports in application code or ENV variable duplication.

**Solution:**
The `port()` helper extracts the targetPort from the ports configuration, with full support for:
- Static port values
- Dynamic port functions (namespace-aware)
- String format parsing (`"80:3000"` → `3000`)
- Proper error handling

**Usage:**

```typescript
// In your application code:
import config from './tsops.config'

const PORT = config.port('worken-api')
app.listen(PORT)

console.log(`Server listening on port ${PORT}`)
// Dev: "Server listening on port 3001"
// Prod: "Server listening on port 80"
```

**Configuration:**

```typescript
// tsops.config.ts
export default defineConfig({
  // ...
  apps: {
    'worken-front': {
      ports: ({ domain }) => [{
        name: 'http',
        port: 80,
        targetPort: domain === 'localhost' ? 3000 : 3000
      }]
    },
    'worken-api': {
      ports: ({ domain }) => [{
        name: 'http',
        port: 80,
        targetPort: domain === 'localhost' ? 3001 : 3000  // Different port locally!
      }]
    },
    'openai-api': {
      ports: ({ domain }) => [{
        name: 'http',
        port: 80,
        targetPort: domain === 'localhost' ? 3002 : 3000
      }]
    }
  }
})
```

**Benefits:**

1. **Single Source of Truth**: Port configuration lives only in tsops config
2. **Type-Safe**: Full TypeScript support with autocomplete
3. **Namespace-Aware**: Automatically respects `TSOPS_NAMESPACE` environment variable
4. **Dynamic**: Supports conditional logic via functions
5. **Error Handling**: Clear error messages if ports not configured

**Local Development:**
Perfect for running multiple services on different ports:
- `worken-front`: http://localhost:3000
- `worken-api`: http://localhost:3001
- `openai-api`: http://localhost:3002

**Production:**
All services can use standard container ports (80, 3000, etc.) without conflicts.

**String Format Support:**
Also supports the `"service:container"` string format:
```typescript
ports: [{ name: 'http', port: "80:3000" }]
config.port('app') // → 3000
```

This feature completes the runtime helpers trinity: `dns()`, `url()`, and `port()` - everything your application needs to know about its deployment environment.

