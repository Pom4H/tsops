/**
 * Test the fixed configuration to ensure proper type inference
 */

import { defineConfigV2 } from '@tsops/core/config/v2'

// Test basic configuration
const testConfig = defineConfigV2({
  project: 'test-app',
  
  namespaces: {
    dev: { 
      domain: 'dev.test.com',
      debug: true 
    },
    prod: { 
      domain: 'test.com',
      debug: false 
    }
  },
  
  services: ({ domain, net, expose, res, depends }) => {
    // Test that domain is available
    console.log('Domain:', domain) // Should be 'dev.test.com' or 'test.com'
    
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
          depends.on('api', 8080) // Should have proper type inference
        ],
        resources: res.smol,
        description: 'Web gateway'
      }
    }
  }
})

// Test that we can access services
const apiService = testConfig.getService('api')
const webDependencies = testConfig.getDependencies('web')
const apiUrl = testConfig.getServiceUrl('api')

console.log('API Service:', apiService)
console.log('Web Dependencies:', webDependencies)
console.log('API URL:', apiUrl)

// Test namespace variables
const devConfig = defineConfigV2({
  project: 'test-app',
  
  namespaces: {
    dev: { 
      domain: 'dev.test.com',
      debug: true,
      logLevel: 'debug'
    }
  },
  
  services: ({ domain, debug, logLevel, net, res, depends }) => {
    // Test that namespace variables are available
    console.log('Domain:', domain)     // 'dev.test.com'
    console.log('Debug:', debug)       // true
    console.log('Log Level:', logLevel) // 'debug'
    
    return {
      api: {
        kind: 'api',
        listen: net.http(8080),
        needs: [],
        resources: res.medium,
        description: 'API service'
      }
    }
  }
})

export { testConfig, devConfig }