/**
 * Test type validation for service dependencies
 */

import { defineConfigV2 } from '@tsops/core/config/v2'

// This should work - all services exist and ports match
const validConfig = defineConfigV2({
  project: 'test-app',
  
  namespaces: {
    prod: { domain: 'test.com' }
  },
  
  services: ({ domain, net, expose, res, depends }) => ({
    api: {
      kind: 'api',
      listen: net.http(8080),
      needs: [],
      resources: res.medium,
      description: 'API service'
    },
    
    web: {
      kind: 'gateway',
      listen: net.http(80),
      public: expose.httpsHost(domain),
      needs: [
        depends.on('api', 8080) // ✅ Valid - api exists and listens on 8080
      ],
      resources: res.smol,
      description: 'Web gateway'
    }
  })
})

// This should show TypeScript errors
const invalidConfig = defineConfigV2({
  project: 'test-app',
  
  namespaces: {
    prod: { domain: 'test.com' }
  },
  
  services: ({ domain, net, expose, res, depends }) => ({
    api: {
      kind: 'api',
      listen: net.http(8080), // API listens on 8080
      needs: [],
      resources: res.medium,
      description: 'API service'
    },
    
    web: {
      kind: 'gateway',
      listen: net.http(80),
      public: expose.httpsHost(domain),
      needs: [
        depends.on('api', 3000),     // ❌ Should error: API listens on 8080, not 3000
        depends.on('auth', 8081),    // ❌ Should error: 'auth' service doesn't exist
        depends.on('database', 5432, { protocol: 'http' }) // ❌ Should error: database uses TCP, not HTTP
      ],
      resources: res.smol,
      description: 'Web gateway'
    }
  })
})

// Test namespace variables
const namespaceTestConfig = defineConfigV2({
  project: 'test-app',
  
  namespaces: {
    dev: { 
      domain: 'dev.test.com',
      debug: true,
      logLevel: 'debug',
      replicas: 1
    }
  },
  
  services: ({ domain, debug, logLevel, replicas, net, res, depends }) => {
    // All namespace variables should be available and typed
    console.log('Domain:', domain)     // 'dev.test.com'
    console.log('Debug:', debug)       // true
    console.log('Log Level:', logLevel) // 'debug'
    console.log('Replicas:', replicas)  // 1
    
    return {
      api: {
        kind: 'api',
        listen: net.http(8080),
        needs: [],
        resources: res.custom('200m', '256Mi', undefined, replicas),
        description: 'API service'
      }
    }
  }
})

export { validConfig, invalidConfig, namespaceTestConfig }