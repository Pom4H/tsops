import { defineConfig } from '@tsops/core'

export default defineConfig({
  project: 'simplified-runtime',
  namespaces: {
    dev: { domain: 'dev.localtest.me', isLocal: true },
    prod: { domain: 'example.com', isLocal: false }
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
      env: ({ secret, configMap, project, namespace }) => ({
        NODE_ENV: 'production',
        PORT: '3000',
        PROJECT: project,
        NAMESPACE: namespace,
        
        // ✅ Good: Secrets and config
        JWT_SECRET: secret('api-secrets', 'JWT_SECRET'),
        DB_PASSWORD: secret('api-secrets', 'DB_PASSWORD'),
        LOG_LEVEL: configMap('api-config', 'LOG_LEVEL')
        
        // ❌ Anti-pattern: Don't use ENV for service endpoints!
        // Instead, use runtime config in your app code:
        // import config from './tsops.config'
        // const url = config.url('frontend', 'service')  // http://frontend
      }),
      // NEW: Object format with explicit protocol control
      // For dev: uses http (no certificate warnings)
      // For prod: uses https (secure production traffic)
      ingress: ({ domain, isLocal }) => ({
        domain: `api.${domain}`,
        protocol: isLocal ? 'http' : 'https'  // protocol is optional, defaults to auto-detect
      })
    },
    'frontend': {
      ports: [{ name: 'http', port: 80, targetPort: 3000 }],
      env: () => ({
        NODE_ENV: 'production',
        PORT: '3000'
        // ✅ For service discovery, use runtime config in your app:
        // import config from './tsops.config'
        // const API_URL = config.url('api', 'service')  // or 'cluster'
      }),
      // Object format with auto-detect protocol
      ingress: ({ domain }) => ({ domain: `app.${domain}` })
    }
  }
})

// ============================================================================
// INGRESS CONFIGURATION - SINGLE SIMPLE FORMAT
// ============================================================================
//
// Object format with optional protocol:
//    ingress: ({ domain }) => ({ domain: `api.${domain}` })
//    
// Protocol auto-detection (if not specified):
//    - *.localtest.me, localhost, *.local → http (no certificate warnings)
//    - Production domains → https (with TLS)
//
// Explicit protocol (for special cases):
//    ingress: ({ domain }) => ({
//      domain: `api.${domain}`,
//      protocol: 'http'  // or 'https'
//    })
//    
// Use cases for explicit protocol:
//    - https://localhost (with self-signed certificate)
//    - Force http for production domain (testing)
//
// ============================================================================
// RUNTIME HELPERS
// ============================================================================
//
// import config from './tsops.config'
//
// // ✅ Service-to-service communication (internal):
// const apiUrl = config.url('api', 'service')  // http://api
// const apiUrl = config.url('api', 'cluster')  // http://api.prod.svc.cluster.local
//
// // ✅ Public ingress URLs (external traffic):
// const publicApiUrl = config.url('api', 'ingress')  // https://api.example.com
//
// // ✅ Get DNS names:
// const dns = config.dns('api', 'service')  // api
// const dns = config.dns('api', 'cluster')  // api.prod.svc.cluster.local
//
// // ✅ Get environment variables:
// const nodeEnv = config.env('api', 'NODE_ENV')
// const jwtSecret = config.env('api', 'JWT_SECRET')
//
// Available helpers:
// - config.url(appName, type) - Full URLs with protocol
//   - type: 'service' - short DNS (http://api)
//   - type: 'cluster' - full cluster DNS (http://api.prod.svc.cluster.local)
//   - type: 'ingress' - public URL (https://api.example.com)
// - config.dns(appName, type) - DNS names without protocol
// - config.env(appName, key) - Environment variables from config