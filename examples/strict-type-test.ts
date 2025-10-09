/**
 * Test strict TypeScript errors
 */

import { defineConfigV2 } from '@tsops/core'

// This should work - valid configuration
const validConfig = defineConfigV2({
  project: 'test-app',
  
  namespaces: {
    dev: { 
      domain: 'dev.test.com',
      debug: true,
      logLevel: 'debug'
    }
  },
  
  services: ({ domain, debug, logLevel, net, expose, res, depends }) => {
    return {
      api: {
        kind: 'api',
        listen: net.http(8080),
        needs: [],
        resources: res.smol,
        description: 'API service'
      },
      
      web: {
        kind: 'gateway',
        listen: net.http(80),
        public: expose.httpsHost(domain),
        needs: [
          depends.on('api', 8080) // ✅ Valid - 'api' exists
        ],
        resources: res.smol,
        description: 'Web gateway'
      }
    }
  }
})

// This should cause TypeScript errors
const invalidConfig = defineConfigV2({
  project: 'test-app',
  
  namespaces: {
    dev: { 
      domain: 'dev.test.com',
      debug: true,
      logLevel: 'debug'
    }
  },
  
  services: ({ domain, debug, logLevel, net, expose, res, depends }) => {
    return {
      api: {
        kind: 'api',
        listen: net.http(8080),
        needs: [],
        resources: res.smol,
        description: 'API service'
      },
      
      web: {
        kind: 'gateway',
        listen: net.http(80),
        public: expose.httpsHost(domain),
        needs: [
          // These should cause TypeScript errors:
          depends.on('auth', 8081),    // ❌ 'auth' service doesn't exist
          depends.on('api', 3000),     // ❌ API listens on 8080, not 3000
          depends.on('database', 5432) // ❌ 'database' service doesn't exist
        ],
        resources: res.smol,
        description: 'Web gateway'
      }
    }
  }
})

export { validConfig, invalidConfig }