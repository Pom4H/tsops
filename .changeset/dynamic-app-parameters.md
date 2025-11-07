---
'@tsops/core': minor
'tsops': minor
---

## Features

### Unified Dynamic Parameters for All App Configuration Fields

All app configuration parameters now support both static values and dynamic functions with access to namespace context. This provides a consistent, unified approach across the entire configuration API.

**Supported Parameters:**
- `ports` - Service ports configuration
- `args` - Container arguments
- `volumes` - Volume definitions
- `volumeMounts` - Volume mount configurations
- `podAnnotations` - Pod annotations

**Before (only static):**
```typescript
apps: {
  'my-app': {
    ports: [{ name: 'http', port: 80, targetPort: 3000 }],  // Always 3000
    args: ['--mode=prod'],                                   // Always prod mode
  }
}
```

**After (static or dynamic):**
```typescript
apps: {
  'worken-front': {
    // Dynamic ports: different targetPort per namespace
    ports: ({ namespace }) => [{
      name: 'http',
      port: 80,
      targetPort: namespace === 'dev' ? 3000 : 3000
    }],
    
    // Dynamic args: enable debug in dev
    args: ({ production }) => 
      production ? ['--mode=prod'] : ['--mode=dev', '--debug'],
    
    // Dynamic volumes: region-specific storage
    volumes: ({ region }) => 
      region === 'us' ? usVolumes : euVolumes,
    
    // Dynamic annotations: namespace-specific labels
    podAnnotations: ({ namespace }) => ({
      'environment': namespace,
      'monitored': namespace === 'prod' ? 'true' : 'false'
    })
  },
  
  'worken-api': {
    ports: ({ namespace }) => [{
      name: 'http',
      port: 80,
      targetPort: namespace === 'dev' ? 3001 : 3000  // Different ports locally!
    }]
  }
}
```

**Context Available:**
All parameters get full access to namespace context:
- `namespace` - Current namespace name ('dev', 'prod', 'stage')
- `domain` - Namespace domain
- `region` - Namespace region
- `production` - Boolean flag (true for production namespace)
- `project` - Project name
- Plus all custom namespace variables

**Use Cases:**

1. **Local Development Ports**: Run multiple services on localhost with different ports
```typescript
ports: ({ domain }) => [{
  name: 'http',
  port: 80,
  targetPort: domain === 'localhost' ? 3001 : 3000
}]
```

2. **Environment-Specific Arguments**: Different config per environment
```typescript
args: ({ namespace }) => 
  namespace === 'dev' 
    ? ['--log-level=debug', '--hot-reload'] 
    : ['--log-level=info']
```

3. **Region-Specific Volumes**: Different storage configurations
```typescript
volumes: ({ region }) => [{
  name: 'data',
  persistentVolumeClaim: { 
    claimName: `data-${region}` 
  }
}]
```

4. **Monitoring Labels**: Conditional annotations
```typescript
podAnnotations: ({ production }) => ({
  'prometheus.io/scrape': production ? 'true' : 'false',
  'datadog.com/tags': production ? 'env:prod' : 'env:dev'
})
```

**Technical Details:**
- Full type safety with TypeScript
- Context typed based on your namespace definition
- Autocomplete for all context properties
- No performance overhead (resolved once during planning)

This feature completes the unified approach to configuration, where every parameter can be either static (for simplicity) or dynamic (for flexibility), using the same pattern throughout the entire API.

