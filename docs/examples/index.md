# Examples

Real-world examples of tsops in action.

## 🚀 CI/CD Integration

Production-ready GitHub Actions workflows for incremental builds in monorepos.

**[View CI/CD Examples →](ci-cd/)**

- Basic incremental build workflow
- Advanced Turborepo integration
- Performance benchmarks and troubleshooting
- Build only changed apps (10x-50x faster CI/CD)

## Simple Web App

Basic Node.js app with Docker build and Kubernetes deployment.

```typescript
import { defineConfig } from 'tsops'

export default defineConfig({
  project: 'my-app',
  
  namespaces: {
    production: { domain: 'example.com', region: 'prod' }
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
      env: ({ url }) => ({
        API_URL: url('backend', 'cluster')
      })
    },
    
    backend: {
      ingress: ({ domain }) => `api.${domain}`,
      env: ({ url, secret, production }) => {
        if (production) {
          return secret('backend-secrets')
        }
        return {
          DB_URL: url('postgres', 'cluster'),
          REDIS_URL: url('redis', 'cluster')
        }
      },
      
      secrets: ({ url, production }) => ({
        'backend-secrets': {
          JWT_SECRET: production ? process.env.PROD_JWT! : 'dev-jwt',
          DB_URL: url('postgres', 'cluster')
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
      env: ({ url }) => ({
        AUTH_SERVICE: url('auth', 'cluster'),
        USER_SERVICE: url('users', 'cluster'),
        ORDER_SERVICE: url('orders', 'cluster')
      })
    },
    
    auth: {
      env: ({ url, secret }) => ({
        ...secret('auth-secrets'),
        DB_URL: url('postgres', 'cluster')
      })
    },
    
    users: {
      env: ({ url, secret }) => ({
        ...secret('users-secrets'),
        DB_URL: url('postgres', 'cluster'),
        CACHE_URL: url('redis', 'cluster')
      })
    },
    
    orders: {
      env: ({ url, secret }) => ({
        ...secret('orders-secrets'),
        DB_URL: url('postgres', 'cluster'),
        PAYMENT_SERVICE: url('payments', 'cluster')
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
      env: ({ url }) => ({
        OTEL_ENDPOINT: url('otel-collector', 'cluster')
      })
    },
    
    'otel-collector': {
      image: 'otel/opentelemetry-collector-contrib:0.100.0',
      env: ({ url }) => ({
        PROMETHEUS_ENDPOINT: url('prometheus', 'cluster'),
        LOKI_ENDPOINT: url('loki', 'cluster')
      })
    },
    
    prometheus: {
      image: 'prom/prometheus:latest',
      ingress: ({ domain }) => `prometheus.${domain}`
    },
    
    grafana: {
      image: 'grafana/grafana:latest',
      ingress: ({ domain }) => `grafana.${domain}`,
      env: ({ url }) => ({
        GF_DATABASE_URL: url('postgres', 'cluster'),
        GF_DATASOURCES_PROMETHEUS: url('prometheus', 'cluster'),
        GF_DATASOURCES_LOKI: url('loki', 'cluster')
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
  namespaces: {
    development: { domain: 'dev.example.com', region: 'dev' },
    staging: { domain: 'staging.example.com', region: 'staging' },
    production: { domain: 'example.com', region: 'prod' }
  },
  
  apps: {
    api: {
      ingress: ({ domain }) => `api.${domain}`,
      
      env: ({ production, dev, dns, secret }) => {
        if (production) {
          return secret('api-secrets')
        }
        
        return {
          NODE_ENV: dev ? 'development' : 'staging',
          LOG_LEVEL: dev ? 'debug' : 'info',
          DB_URL: url('postgres', 'cluster')
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
      env: ({ url }): AppConfig => ({
        database: url('postgres', 'cluster'),
        redis: url('redis', 'cluster')
      })
    },
    
    worker: {
      build: {
        type: 'dockerfile',
        context: './packages/worker',
        dockerfile: './packages/worker/Dockerfile'
      },
      env: ({ url }): AppConfig => ({
        database: url('postgres', 'cluster'),
        redis: url('redis', 'cluster')
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


