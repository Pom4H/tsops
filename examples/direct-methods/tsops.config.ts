import { defineConfig } from '@tsops/core'

export default defineConfig({
  project: 'simplified-runtime',
  namespaces: {
    dev: { domain: 'dev.example.com' },
    prod: { domain: 'example.com' }
  },
  clusters: {
    dev: { 
      apiServer: 'https://dev.local:6443', 
      context: 'dev', 
      namespaces: ['dev'] 
    },
    prod: { 
      apiServer: 'https://prod.local:6443', 
      context: 'prod', 
      namespaces: ['prod'] 
    }
  },
  images: { 
    registry: 'ghcr.io/acme', 
    tagStrategy: 'git-tag', 
    includeProjectInName: false 
  },
  apps: {
    'api': {
      ports: [{ name: 'http', port: 3000, targetPort: 3000 }],
      env: ({ url, dns, secret, configMap, project, namespace }) => ({
        NODE_ENV: 'production',
        PORT: '3000',
        PROJECT: project,
        NAMESPACE: namespace,
        
        // Using url helper - automatic port resolution
        FRONTEND_URL: url('frontend', 'cluster'),
        EXTERNAL_URL: url('api', 'ingress'),
        
        // Using dns helper - just DNS names
        CLUSTER_DNS: dns('api', 'cluster'),
        SERVICE_DNS: dns('api', 'service'),
        
        // Using secret/configMap helpers
        JWT_SECRET: secret('api-secrets', 'JWT_SECRET'),
        DB_PASSWORD: secret('api-secrets', 'DB_PASSWORD'),
        LOG_LEVEL: configMap('api-config', 'LOG_LEVEL')
      }),
      network: ({ domain }) => `api.${domain}`
    },
    'frontend': {
      ports: [{ name: 'http', port: 80, targetPort: 3000 }],
      env: ({ url, dns }) => ({
        NODE_ENV: 'production',
        PORT: '3000',
        
        // Simple URL construction
        API_URL: url('api', 'cluster'),
        EXTERNAL_API_URL: url('api', 'ingress')
      }),
      network: ({ domain }) => `app.${domain}`
    }
  }
})

// Example usage in your application:
/*
import config from './tsops.config'

// Use helpers directly on config
console.log('API Cluster URL:', config.url('api', 'cluster'))
console.log('API Service DNS:', config.dns('api', 'service'))
console.log('API Ingress URL:', config.url('api', 'ingress'))

// Get environment variables
const nodeEnv = config.env('api', 'NODE_ENV')
const port = config.env('api', 'PORT')
console.log('API Environment:', { nodeEnv, port })

// All helpers are available:
// - config.dns(appName, type) - DNS names only
// - config.url(appName, type, options?) - Complete URLs with ports
// - config.env(appName, key) - Individual environment variables
*/