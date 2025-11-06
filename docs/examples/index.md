# Examples

Real-world examples of tsops in action.

## Simple Web App

Basic Node.js app with Docker build and container deployment.

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
      
      ingress: ({ domain }) => ({ domain: `www.${domain}` }),
      
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
      ingress: ({ domain }) => ({ domain: `app.${domain}` }),
      env: () => ({
        // ✅ In your app: config.url('backend', 'service')
      })
    },
    
    backend: {
      ingress: ({ domain }) => ({ domain: `api.${domain}` }),
      env: ({ secret, production }) => {
        if (production) {
          return secret('backend-secrets')
        }
        return {
          // ✅ In your app: config.url('postgres', 'service')
          // ✅ In your app: config.url('redis', 'service')
        }
      },
      
      secrets: ({ production }) => ({
        'backend-secrets': {
          JWT_SECRET: production ? process.env.PROD_JWT! : 'dev-jwt'
          // ✅ For internal services, use config.url() in app code
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
      ingress: ({ domain }) => ({ domain: `api.${domain}` }),
      env: () => ({
        // ✅ In your app:
        // config.url('auth', 'service')
        // config.url('users', 'service')
        // config.url('orders', 'service')
      })
    },
    
    auth: {
      env: ({ secret }) => ({
        ...secret('auth-secrets')
        // ✅ In your app: config.url('postgres', 'service')
      })
    },
    
    users: {
      env: ({ secret }) => ({
        ...secret('users-secrets')
        // ✅ In app: config.url('postgres'/'redis', 'service')
      })
    },
    
    orders: {
      env: ({ secret }) => ({
        ...secret('orders-secrets')
        // ✅ In app: config.url('postgres'/'payments', 'service')
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
      env: () => ({
        // ✅ In your app: config.url('otel-collector', 'service')
      })
    },
    
    'otel-collector': {
      image: 'otel/opentelemetry-collector-contrib:0.100.0',
      env: () => ({
        // ✅ In app: config.url('prometheus'/'loki', 'service')
      })
    },
    
    prometheus: {
      image: 'prom/prometheus:latest',
      ingress: ({ domain }) => ({ domain: `prometheus.${domain}` })
    },
    
    grafana: {
      image: 'grafana/grafana:latest',
      ingress: ({ domain }) => ({ domain: `grafana.${domain}` }),
      env: () => ({
        // ✅ In your app: config.url('postgres'/'prometheus'/'loki', 'service')
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
      ingress: ({ domain }) => ({ domain: `api.${domain}` }),
      
      env: ({ production, dev, secret }) => {
        if (production) {
          return secret('api-secrets')
        }
        
        return {
          NODE_ENV: dev ? 'development' : 'staging',
          LOG_LEVEL: dev ? 'debug' : 'info'
          // ✅ In your app: config.url('postgres', 'service')
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
      env: (): AppConfig => ({
        // ✅ In your app: config.url('postgres'/'redis', 'service')
      })
    },
    
    worker: {
      build: {
        type: 'dockerfile',
        context: './packages/worker',
        dockerfile: './packages/worker/Dockerfile'
      },
      env: (): AppConfig => ({
        // ✅ In your app: config.url('postgres'/'redis', 'service')
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


