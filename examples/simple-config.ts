/**
 * Simple test configuration
 */

import { defineConfigV2 } from '@tsops/core'

const config = defineConfigV2({
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
    // All namespace variables should be available and properly typed
    console.log('Domain:', domain)     // string
    console.log('Debug:', debug)       // boolean  
    console.log('Log Level:', logLevel) // string
    
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
          depends.on('api', 8080) // Should be properly typed - only 'api' should be valid
        ],
        resources: res.smol,
        description: 'Web gateway'
      }
    }
  }
})

export { config }