---
'@tsops/core': minor
'tsops': minor
---

## Features

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

