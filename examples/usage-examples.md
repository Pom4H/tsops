# New Configuration Schema - Usage Examples

## Basic Service Configuration

```typescript
import { defineConfigV2 } from '@tsops/core/config/v2'

export default defineConfigV2({
  project: 'my-app',
  
  namespaces: {
    prod: {
      domain: 'example.com'
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
    },
    
    api: {
      kind: 'api',
      listen: net.http(8080),
      needs: [
        depends.on('database', 5432, { protocol: 'tcp' })
      ],
      resources: res.medium,
      description: 'API service'
    }
  })
})
```

## Advanced Service Configuration

```typescript
export default defineConfigV2({
  project: 'microservices-app',
  
  namespaces: {
    prod: {
      domain: 'app.com',
      region: 'us-west-2',
      replicas: 3
    }
  },
  
  services: ({ domain, net, expose, res, depends, service, env }) => ({
    // Gateway with multiple protocols
    gateway: {
      kind: 'gateway',
      listen: net.http(80),
      public: expose.httpsHost(domain),
      needs: [
        depends.on('api', 8080, { description: 'REST API' }),
        depends.on('grpc-api', 9090, { protocol: 'grpc', description: 'gRPC API' }),
        depends.on('websocket', 8081, { description: 'WebSocket service' })
      ],
      resources: res.medium,
      description: 'Main gateway'
    },
    
    // REST API
    api: {
      kind: 'api',
      listen: net.http(8080),
      needs: [
        depends.on('database', 5432, { protocol: 'tcp' }),
        depends.on('cache', 6379, { protocol: 'tcp' }),
        depends.on('queue', 5672, { protocol: 'tcp' })
      ],
      resources: res.large,
      description: 'REST API service'
    },
    
    // gRPC API
    'grpc-api': {
      kind: 'api',
      listen: net.grpc(9090),
      needs: [
        depends.on('database', 5432, { protocol: 'tcp' })
      ],
      resources: res.medium,
      description: 'gRPC API service'
    },
    
    // WebSocket service
    websocket: {
      kind: 'api',
      listen: net.http(8081),
      needs: [
        depends.on('cache', 6379, { protocol: 'tcp' })
      ],
      resources: res.medium,
      description: 'WebSocket service'
    },
    
    // Database
    database: {
      kind: 'database',
      listen: net.tcp(5432),
      needs: [],
      resources: res.large,
      description: 'PostgreSQL database'
    },
    
    // Cache
    cache: {
      kind: 'cache',
      listen: net.tcp(6379),
      needs: [],
      resources: res.medium,
      description: 'Redis cache'
    },
    
    // Queue
    queue: {
      kind: 'queue',
      listen: net.tcp(5672),
      needs: [],
      resources: res.medium,
      description: 'RabbitMQ queue'
    }
  })
})
```

## Using the Prune Command

### Generate runtime config for web service

```bash
# Generate TypeScript runtime config
tsops prune web

# Generate minimal config (only direct dependencies)
tsops prune web --minimal

# Include transitive dependencies
tsops prune web --include-transitive

# Generate JavaScript config
tsops prune web --format javascript

# Custom output path
tsops prune web --output src/runtime/web.config.ts
```

### Generated runtime config usage

```typescript
// tsops.runtime.ts (generated)
import { config, getDependencyUrl, getStaticEnvVar } from './tsops.runtime'

// Get service URLs
const apiUrl = getDependencyUrl('api')
const authUrl = getDependencyUrl('auth')

// Get environment variables
const port = getStaticEnvVar('PORT')
const nodeEnv = getStaticEnvVar('NODE_ENV')

// Use in your application
const apiClient = new ApiClient(apiUrl)
const authClient = new AuthClient(authUrl)
```

## Type Safety Features

### Service Dependencies

```typescript
// TypeScript will validate service names
const webService = config.getService('web') // ✅ Valid
const invalidService = config.getService('invalid') // ❌ TypeScript error

// Type-safe dependency access
const webDeps = config.getDependencies('web')
// Type: ServiceDependency<TServices>[]

// Type-safe service URLs
const apiUrl = config.getServiceUrl('api', 8080) // ✅ Valid
const invalidUrl = config.getServiceUrl('invalid', 8080) // ❌ TypeScript error
```

### IDE Autocomplete

```typescript
// IDE will suggest available services
depends.on('api', 8080) // ✅ 'api' is suggested
depends.on('auth', 8081) // ✅ 'auth' is suggested
depends.on('invalid', 8080) // ❌ TypeScript error

// IDE will suggest available service kinds
{
  kind: 'gateway' // ✅ Suggested: 'gateway' | 'api' | 'worker' | 'database' | 'cache'
}

// IDE will suggest resource profiles
resources: res.smol // ✅ Suggested: 'smol' | 'medium' | 'large' | 'custom'
```

## Network Configuration

### HTTP Services

```typescript
// HTTP service
listen: net.http(8080)

// HTTP with path
listen: net.http(8080, '/api/v1')

// HTTPS service
listen: net.https(8443)

// Custom HTTP configuration
listen: {
  protocol: 'http',
  port: 8080,
  path: '/api'
}
```

### TCP/UDP Services

```typescript
// TCP service (database)
listen: net.tcp(5432)

// UDP service (metrics)
listen: net.udp(8125)

// gRPC service
listen: net.grpc(9090)
```

### Public Endpoints

```typescript
// HTTPS public endpoint
public: expose.httpsHost('example.com')

// HTTP public endpoint
public: expose.httpHost('dev.example.com')

// Custom public endpoint
public: expose.custom('api.example.com', 'https', '/v1')

// With path
public: expose.httpsHost('example.com', '/api')
```

## Resource Configuration

### Predefined Profiles

```typescript
// Small service (1 replica, 100m CPU, 128Mi memory)
resources: res.smol

// Medium service (2 replicas, 500m CPU, 512Mi memory)
resources: res.medium

// Large service (3 replicas, 1000m CPU, 1Gi memory)
resources: res.large
```

### Custom Resources

```typescript
// Custom resource configuration
resources: res.custom('2000m', '2Gi', '10Gi', 5)

// Or direct configuration
resources: {
  cpu: '2000m',
  memory: '2Gi',
  storage: '10Gi',
  replicas: 5
}
```

## Environment Variables

### Static Values

```typescript
env: {
  NODE_ENV: 'production',
  PORT: '8080',
  DEBUG: 'false'
}
```

### Dynamic Values

```typescript
env: ({ env, service, domain }) => ({
  NODE_ENV: env('NODE_ENV', 'production'),
  PORT: '8080',
  API_URL: service.url('api'),
  DOMAIN: domain,
  DEBUG: env('DEBUG', 'false')
})
```

### Secret References

```typescript
env: ({ secret }) => ({
  JWT_SECRET: secret('api-secrets', 'JWT_SECRET'),
  DATABASE_PASSWORD: secret('database-secrets', 'PASSWORD')
})
```

### ConfigMap References

```typescript
env: ({ configMap }) => ({
  LOG_LEVEL: configMap('api-config', 'LOG_LEVEL'),
  FEATURE_FLAGS: configMap('api-config', 'FEATURE_FLAGS')
})
```

## Service Discovery

### Internal URLs

```typescript
// Get internal service URL
const apiUrl = service.url('api') // http://my-app-api.default.svc.cluster.local:8080
const apiUrlWithPort = service.url('api', 8080) // Same as above
const grpcUrl = service.url('grpc-api', 9090) // http://my-app-grpc-api.default.svc.cluster.local:9090
```

### External URLs

```typescript
// Get external service URL (if public endpoint is configured)
const webUrl = service.external('web') // https://example.com
const apiUrl = service.external('api') // undefined (no public endpoint)
```

## Best Practices

### 1. Service Naming

```typescript
// Use descriptive names
services: {
  'user-api': { /* ... */ },        // ✅ Clear purpose
  'payment-service': { /* ... */ }, // ✅ Clear purpose
  'svc1': { /* ... */ }             // ❌ Unclear purpose
}
```

### 2. Dependency Management

```typescript
// Only declare direct dependencies
web: {
  needs: [
    depends.on('api', 8080),     // ✅ Direct dependency
    depends.on('auth', 8081)     // ✅ Direct dependency
    // Don't include api's dependencies here
  ]
}
```

### 3. Resource Sizing

```typescript
// Start with appropriate resource profiles
gateway: { resources: res.medium },  // ✅ Gateway needs more resources
worker: { resources: res.large },    // ✅ Worker needs more resources
cache: { resources: res.medium },    // ✅ Cache needs moderate resources
```

### 4. Network Configuration

```typescript
// Use appropriate protocols
database: { listen: net.tcp(5432) },     // ✅ TCP for database
api: { listen: net.http(8080) },         // ✅ HTTP for API
grpc: { listen: net.grpc(9090) },        // ✅ gRPC for internal services
```

### 5. Environment Variables

```typescript
// Use environment references for secrets
env: {
  JWT_SECRET: secret('secrets', 'JWT_SECRET'), // ✅ Reference, not value
  LOG_LEVEL: configMap('config', 'LOG_LEVEL')  // ✅ Reference, not value
}
```