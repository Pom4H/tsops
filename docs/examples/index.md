# Examples

Real-world examples of tsops in action.

## Simple Web App

Basic Node.js app with Docker build and Kubernetes deployment.

```typescript
import { defineConfig } from 'tsops'

export default defineConfig({
  project: 'my-app',
  domain: { prod: 'example.com' },
  
  namespaces: {
    production: { region: 'prod' }
  },
  
  apps: {
    web: {
      build: {
        type: 'dockerfile',
        context: './web',
        dockerfile: './web/Dockerfile'
      },
      
      ingress: ({ domain }) => `www.${domain}`,
      
      env: ({ production }) => ({
        NODE_ENV: production ? 'production' : 'development',
        PORT: '3000'
      })
    }
  }
})
```

[Full Example →](/examples/fullstack)

## Full-Stack Application

Frontend + Backend + Database with secrets and service discovery.

```typescript
export default defineConfig({
  apps: {
    frontend: {
      ingress: ({ domain }) => `app.${domain}`,
      env: ({ serviceDNS }) => ({
        API_URL: serviceDNS('backend', 3000)
      })
    },
    
    backend: {
      ingress: ({ domain }) => `api.${domain}`,
      env: ({ serviceDNS, secret, production }) => {
        if (production) {
          return secret('backend-secrets')
        }
        return {
          DB_URL: serviceDNS('postgres', 5432),
          REDIS_URL: serviceDNS('redis', 6379)
        }
      },
      
      secrets: ({ serviceDNS, production }) => ({
        'backend-secrets': {
          JWT_SECRET: production ? process.env.PROD_JWT! : 'dev-jwt',
          DB_URL: serviceDNS('postgres', 5432)
        }
      })
    },
    
    postgres: {
      image: 'postgres:16-alpine',
      env: () => ({
        POSTGRES_DB: 'myapp',
        POSTGRES_USER: 'user',
        POSTGRES_PASSWORD: process.env.DB_PASSWORD || 'dev-password'
      })
    }
  }
})
```

[Full Example →](/examples/fullstack)

## Microservices

Multiple services with shared configuration.

```typescript
export default defineConfig({
  apps: {
    gateway: {
      ingress: ({ domain }) => `api.${domain}`,
      env: ({ serviceDNS }) => ({
        AUTH_SERVICE: serviceDNS('auth', 3001),
        USER_SERVICE: serviceDNS('users', 3002),
        ORDER_SERVICE: serviceDNS('orders', 3003)
      })
    },
    
    auth: {
      env: ({ serviceDNS, secret }) => ({
        ...secret('auth-secrets'),
        DB_URL: serviceDNS('postgres', 5432)
      })
    },
    
    users: {
      env: ({ serviceDNS, secret }) => ({
        ...secret('users-secrets'),
        DB_URL: serviceDNS('postgres', 5432),
        CACHE_URL: serviceDNS('redis', 6379)
      })
    },
    
    orders: {
      env: ({ serviceDNS, secret }) => ({
        ...secret('orders-secrets'),
        DB_URL: serviceDNS('postgres', 5432),
        PAYMENT_SERVICE: serviceDNS('payments', 3004)
      })
    }
  }
})
```

[Full Example →](/examples/monitoring)

## With Monitoring

Add Prometheus, Grafana, and Loki.

```typescript
export default defineConfig({
  apps: {
    api: {
      env: ({ serviceDNS }) => ({
        OTEL_ENDPOINT: serviceDNS('otel-collector', 4318)
      })
    },
    
    'otel-collector': {
      image: 'otel/opentelemetry-collector-contrib:0.100.0',
      env: ({ serviceDNS }) => ({
        PROMETHEUS_ENDPOINT: serviceDNS('prometheus', 9090),
        LOKI_ENDPOINT: serviceDNS('loki', 3100)
      })
    },
    
    prometheus: {
      image: 'prom/prometheus:latest',
      ingress: ({ domain }) => `prometheus.${domain}`
    },
    
    grafana: {
      image: 'grafana/grafana:latest',
      ingress: ({ domain }) => `grafana.${domain}`,
      env: ({ serviceDNS }) => ({
        GF_DATABASE_URL: serviceDNS('postgres', 5432),
        GF_DATASOURCES_PROMETHEUS: serviceDNS('prometheus', 9090),
        GF_DATASOURCES_LOKI: serviceDNS('loki', 3100)
      })
    },
    
    loki: {
      image: 'grafana/loki:latest'
    }
  }
})
```

## Multi-Environment

Dev, staging, and production with different configurations.

```typescript
export default defineConfig({
  domain: {
    dev: 'dev.example.com',
    staging: 'staging.example.com',
    prod: 'example.com'
  },
  
  namespaces: {
    development: { region: 'dev' },
    staging: { region: 'staging' },
    production: { region: 'prod' }
  },
  
  apps: {
    api: {
      ingress: ({ domain }) => `api.${domain}`,
      
      env: ({ production, dev, serviceDNS, secret }) => {
        if (production) {
          return secret('api-secrets')
        }
        
        return {
          NODE_ENV: dev ? 'development' : 'staging',
          LOG_LEVEL: dev ? 'debug' : 'info',
          DB_URL: serviceDNS('postgres', 5432)
        }
      },
      
      secrets: ({ production, dev }) => {
        if (production) {
          return {
            'api-secrets': {
              JWT_SECRET: process.env.PROD_JWT!,
              DB_PASSWORD: process.env.PROD_DB_PWD!
            }
          }
        }
        
        return {
          'api-secrets': {
            JWT_SECRET: dev ? 'dev-jwt' : 'staging-jwt',
            DB_PASSWORD: dev ? 'dev-pwd' : 'staging-pwd'
          }
        }
      }
    }
  }
})
```

## Monorepo

Multiple apps in a monorepo with shared types.

```typescript
// packages/shared/types.ts
export interface AppConfig {
  database: string
  redis: string
}

// tsops.config.ts
import { defineConfig } from 'tsops'
import type { AppConfig } from './packages/shared/types'

export default defineConfig({
  apps: {
    api: {
      build: {
        type: 'dockerfile',
        context: './packages/api',
        dockerfile: './packages/api/Dockerfile'
      },
      env: ({ serviceDNS }): AppConfig => ({
        database: serviceDNS('postgres', 5432),
        redis: serviceDNS('redis', 6379)
      })
    },
    
    worker: {
      build: {
        type: 'dockerfile',
        context: './packages/worker',
        dockerfile: './packages/worker/Dockerfile'
      },
      env: ({ serviceDNS }): AppConfig => ({
        database: serviceDNS('postgres', 5432),
        redis: serviceDNS('redis', 6379)
      })
    }
  }
})
```

[Full Example →](/examples/monorepo)

## Browse All Examples

- [Full-Stack](/examples/fullstack) - Complete application
- [Monitoring](/examples/monitoring) - Observability stack
- [Monorepo](/examples/monorepo) - Multi-app repo

## Example Repository

All examples are available in the [tsops-examples](https://github.com/yourusername/tsops-examples) repository.

```bash
git clone https://github.com/yourusername/tsops-examples
cd tsops-examples/simple-app
pnpm install
pnpm tsops plan
```


