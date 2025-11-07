---
'@tsops/core': minor
'tsops': minor
---

## Features

### Added port support in ingress for local development

Added optional `port` field to ingress definition, enabling multiple services to run on different ports during local development on the same domain (e.g., localhost).

**Use Case:**
When developing locally, you often need to run multiple services on `localhost` with different ports:
- `worken-front`: http://localhost:3000
- `worken-api`: http://localhost:3001
- `openai-api`: http://localhost:3002

**Example:**

```typescript
apps: {
  'worken-front': {
    ingress: ({ domain }) => ({ 
      domain,
      port: domain === 'localhost' ? 3000 : undefined
    }),
    // ... rest of config
  },
  'worken-api': {
    ingress: ({ domain }) => ({ 
      domain: `api.${domain}`,
      port: domain === 'localhost' ? 3001 : undefined
    }),
    // ... rest of config
  }
}
```

**Result:**
```typescript
// In dev (domain: localhost):
config.url('worken-front', 'ingress') // → http://localhost:3000
config.url('worken-api', 'ingress')   // → http://localhost:3001

// In production (domain: worken.ru):
config.url('worken-front', 'ingress') // → https://worken.ru
config.url('worken-api', 'ingress')   // → https://api.worken.ru
```

**Technical Details:**
- Port is only added to `ingress` type URLs
- `cluster` and `service` types remain unaffected (no ports)
- Port is optional and omitted when `undefined`
- Works seamlessly with protocol auto-detection

**Changes:**
- Added `port?: number` to `IngressDefinitionObject`
- Updated `resolveNetwork` to extract and return port from ingress
- Updated runtime `url()` helper to append port when present
- Added comprehensive test coverage

This feature makes local development workflows much smoother when running multiple services simultaneously!

