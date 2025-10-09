/**
 * Example configuration using the new defineConfigV2 with typed service dependencies
 * This demonstrates the improved DX with service topology awareness
 */

import { defineConfigV2 } from '@tsops/core/config/v2'

export default defineConfigV2({
  project: 'hyper-graph',
  
  namespaces: {
    dev: {
      domain: 'dev.hyper-graph.com',
      replicas: 1,
      debug: true
    },
    staging: {
      domain: 'staging.hyper-graph.com',
      replicas: 2,
      debug: false
    },
    prod: {
      domain: 'hyper-graph.com',
      replicas: 3,
      debug: false
    }
  },
  
  // New services configuration with typed dependencies
  services: ({ domain, net, expose, res, depends, service, env }) => ({
    // Gateway service - entry point
    web: {
      kind: 'gateway',
      listen: net.http(8080),
      public: expose.httpsHost(domain),
      needs: [
        depends.on('api', 8080, { description: 'Main API service' }),
        depends.on('auth', 8081, { description: 'Authentication service' }),
        depends.on('observability', 4318, { description: 'OTLP collector' })
      ],
      resources: res.smol,
      description: 'Web platform gateway',
      env: {
        NODE_ENV: env('NODE_ENV', 'production'),
        PORT: '8080',
        API_URL: service.url('api'),
        AUTH_URL: service.url('auth'),
        OBSERVABILITY_URL: service.url('observability'),
        DOMAIN: domain
      }
    },
    
    // API service - business logic
    api: {
      kind: 'api',
      listen: net.http(8080),
      needs: [
        depends.on('database', 5432, { protocol: 'tcp', description: 'PostgreSQL database' }),
        depends.on('cache', 6379, { protocol: 'tcp', description: 'Redis cache' }),
        depends.on('queue', 5672, { protocol: 'tcp', description: 'RabbitMQ message queue' })
      ],
      resources: res.medium,
      description: 'Main API service',
      env: {
        NODE_ENV: env('NODE_ENV', 'production'),
        PORT: '8080',
        DATABASE_URL: service.url('database', 5432),
        REDIS_URL: service.url('cache', 6379),
        QUEUE_URL: service.url('queue', 5672)
      }
    },
    
    // Authentication service
    auth: {
      kind: 'api',
      listen: net.http(8081),
      needs: [
        depends.on('database', 5432, { protocol: 'tcp', description: 'User data storage' }),
        depends.on('cache', 6379, { protocol: 'tcp', description: 'Session storage' })
      ],
      resources: res.medium,
      description: 'Authentication and authorization service',
      env: {
        NODE_ENV: env('NODE_ENV', 'production'),
        PORT: '8081',
        DATABASE_URL: service.url('database', 5432),
        REDIS_URL: service.url('cache', 6379)
      }
    },
    
    // Background worker service
    worker: {
      kind: 'worker',
      listen: net.http(8082),
      needs: [
        depends.on('queue', 5672, { protocol: 'tcp', description: 'Job queue' }),
        depends.on('database', 5432, { protocol: 'tcp', description: 'Data persistence' }),
        depends.on('storage', 9000, { protocol: 'http', description: 'File storage' })
      ],
      resources: res.large,
      description: 'Background job processor',
      env: {
        NODE_ENV: env('NODE_ENV', 'production'),
        PORT: '8082',
        QUEUE_URL: service.url('queue', 5672),
        DATABASE_URL: service.url('database', 5432),
        STORAGE_URL: service.url('storage', 9000)
      }
    },
    
    // Observability service
    observability: {
      kind: 'worker',
      listen: net.http(4318),
      needs: [], // No dependencies
      resources: res.smol,
      description: 'OpenTelemetry collector',
      env: {
        NODE_ENV: env('NODE_ENV', 'production'),
        PORT: '4318'
      }
    },
    
    // Database service
    database: {
      kind: 'database',
      listen: net.tcp(5432),
      needs: [], // No dependencies
      resources: res.large,
      description: 'PostgreSQL database',
      env: {
        POSTGRES_DB: 'hypergraph',
        POSTGRES_USER: 'hypergraph',
        POSTGRES_PASSWORD: env('POSTGRES_PASSWORD', 'secret')
      }
    },
    
    // Cache service
    cache: {
      kind: 'cache',
      listen: net.tcp(6379),
      needs: [], // No dependencies
      resources: res.medium,
      description: 'Redis cache',
      env: {
        REDIS_PASSWORD: env('REDIS_PASSWORD', 'secret')
      }
    },
    
    // Queue service
    queue: {
      kind: 'queue',
      listen: net.tcp(5672),
      needs: [], // No dependencies
      resources: res.medium,
      description: 'RabbitMQ message queue',
      env: {
        RABBITMQ_DEFAULT_USER: 'hypergraph',
        RABBITMQ_DEFAULT_PASS: env('RABBITMQ_PASSWORD', 'secret')
      }
    },
    
    // Storage service
    storage: {
      kind: 'storage',
      listen: net.http(9000),
      needs: [], // No dependencies
      resources: res.large,
      description: 'MinIO object storage',
      env: {
        MINIO_ROOT_USER: 'hypergraph',
        MINIO_ROOT_PASSWORD: env('MINIO_PASSWORD', 'secret')
      }
    }
  }),
  
  // Inherit other configuration from existing schema
  clusters: {
    'us-cluster': {
      apiServer: 'https://k8s.us.hyper-graph.com',
      context: 'us-k8s',
      namespaces: ['dev', 'staging', 'prod']
    }
  },
  
  images: {
    registry: 'ghcr.io/hyper-graph',
    tagStrategy: 'git-sha',
    includeProjectInName: true
  },
  
  secrets: {
    'api-secrets': ({ env }) => ({
      JWT_SECRET: env('JWT_SECRET', 'dev-secret'),
      API_KEY: env('API_KEY', 'dev-key')
    }),
    'database-secrets': ({ env }) => ({
      POSTGRES_PASSWORD: env('POSTGRES_PASSWORD', 'dev-password')
    })
  },
  
  configMaps: {
    'api-config': {
      LOG_LEVEL: 'info',
      FEATURE_FLAGS: '{"newUI": true, "betaFeatures": false}'
    }
  }
})

// Type-safe access to services
type Config = typeof config
type ServiceNames = keyof Config['services']
type WebDependencies = Config['services']['web']['needs'][number]['service']

// Example of type-safe service access
// const webService = config.getService('web')
// const apiDependency = config.getDependencies('web')
// const apiUrl = config.getServiceUrl('api', 8080)