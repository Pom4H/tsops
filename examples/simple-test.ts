/**
 * Simple test to verify types work correctly
 */

import { defineConfigV2 } from '@tsops/core/config/v2'

// Test basic configuration with namespace variables
const testConfig = defineConfigV2({
  project: 'test-app',
  
  namespaces: {
    dev: { 
      domain: 'dev.test.com',
      debug: true,
      logLevel: 'debug'
    },
    prod: { 
      domain: 'test.com',
      debug: false,
      logLevel: 'warn'
    }
  },
  
  services: ({ domain, debug, logLevel, net, expose, res, depends }) => {
    // These should all be properly typed now
    console.log('Domain:', domain)     // string
    console.log('Debug:', debug)       // boolean
    console.log('Log Level:', logLevel) // string
    
    return {
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
          depends.on('api', 8080) // Should be properly typed
        ],
        resources: res.smol,
        description: 'Web gateway'
      }
    }
  }
})

// Test that we can access the configuration
console.log('Config project:', testConfig.project)
console.log('Config namespaces:', testConfig.namespaces)

// Test service access
const apiService = testConfig.getService('api')
console.log('API Service:', apiService)

const webDependencies = testConfig.getDependencies('web')
console.log('Web Dependencies:', webDependencies)

export { testConfig }