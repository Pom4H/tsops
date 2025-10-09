/**
 * Example showing namespace-aware configuration
 * The same service can be deployed to different namespaces with different URLs
 */

import { defineConfigV2 } from '@tsops/core/config/v2'

export default defineConfigV2({
  project: 'hyper-graph',
  
  namespaces: {
    dev: {
      domain: 'dev.hyper-graph.com',
      replicas: 1,
      debug: true,
      logLevel: 'debug'
    },
    staging: {
      domain: 'staging.hyper-graph.com',
      replicas: 2,
      debug: false,
      logLevel: 'info'
    },
    prod: {
      domain: 'hyper-graph.com',
      replicas: 3,
      debug: false,
      logLevel: 'warn'
    }
  },
  
  services: ({ domain, net, expose, res, depends, service, env }) => ({
    web: {
      kind: 'gateway',
      listen: net.http(8080),
      public: expose.httpsHost(domain),
      needs: [
        depends.on('api', 8080),
        depends.on('auth', 8081)
      ],
      resources: res.smol,
      description: 'Web gateway',
      env: {
        NODE_ENV: env('NODE_ENV', 'production'),
        PORT: '8080',
        API_URL: service.url('api'),
        AUTH_URL: service.url('auth'),
        DOMAIN: domain,
        DEBUG: env('DEBUG', 'false'),
        LOG_LEVEL: env('LOG_LEVEL', 'info')
      }
    },
    
    api: {
      kind: 'api',
      listen: net.http(8080),
      needs: [
        depends.on('database', 5432, { protocol: 'tcp' })
      ],
      resources: res.medium,
      description: 'API service',
      env: {
        NODE_ENV: env('NODE_ENV', 'production'),
        PORT: '8080',
        DATABASE_URL: service.url('database', 5432),
        LOG_LEVEL: env('LOG_LEVEL', 'info')
      }
    },
    
    auth: {
      kind: 'api',
      listen: net.http(8081),
      needs: [
        depends.on('database', 5432, { protocol: 'tcp' })
      ],
      resources: res.medium,
      description: 'Auth service',
      env: {
        NODE_ENV: env('NODE_ENV', 'production'),
        PORT: '8081',
        DATABASE_URL: service.url('database', 5432),
        LOG_LEVEL: env('LOG_LEVEL', 'info')
      }
    },
    
    database: {
      kind: 'database',
      listen: net.tcp(5432),
      needs: [],
      resources: res.large,
      description: 'PostgreSQL database',
      env: {
        POSTGRES_DB: 'hypergraph',
        POSTGRES_USER: 'hypergraph',
        POSTGRES_PASSWORD: env('POSTGRES_PASSWORD', 'secret')
      }
    }
  })
})

// Now when you run:
// tsops prune web --namespace dev
// tsops prune web --namespace staging  
// tsops prune web --namespace prod
//
// You'll get different URLs for each namespace:
// - dev: http://hyper-graph-api.dev.svc.cluster.local:8080
// - staging: http://hyper-graph-api.staging.svc.cluster.local:8080
// - prod: http://hyper-graph-api.prod.svc.cluster.local:8080