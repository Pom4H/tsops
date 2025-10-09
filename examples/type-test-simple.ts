/**
 * Test the simplified configuration to verify proper type inference
 */

import { defineConfigV2 } from '@tsops/core/config/v2'

// Test configuration with proper typing
const config = defineConfigV2({
  project: 'test-app',
  
  namespaces: {
    dev: { 
      domain: 'dev.test.com',
      debug: true,
      logLevel: 'debug',
      replicas: 1
    },
    prod: { 
      domain: 'test.com',
      debug: false,
      logLevel: 'warn',
      replicas: 3
    }
  },
  
  services: ({ domain, debug, logLevel, replicas, net, expose, res, depends }) => {
    // All namespace variables should be available and properly typed
    console.log('Domain:', domain)     // string
    console.log('Debug:', debug)       // boolean  
    console.log('Log Level:', logLevel) // string
    console.log('Replicas:', replicas)  // number
    
    return {
      api: {
        kind: 'api',
        listen: net.http(8080),
        needs: [],
        resources: res.custom('200m', '256Mi', undefined, replicas),
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

// Test that we can access the configuration
console.log('Config project:', config.project)
console.log('Config namespaces:', config.namespaces)

// Test service access
const apiService = config.getService('api')
console.log('API Service:', apiService)

const webDependencies = config.getDependencies('web')
console.log('Web Dependencies:', webDependencies)

const apiUrl = config.getServiceUrl('api')
console.log('API URL:', apiUrl)

// Test type checking
type ConfigType = typeof config
type ServiceNames = keyof ConfigType['services']
// Should be: 'api' | 'web'

type ApiDependencies = ConfigType['services']['api']['needs'][number]['service']
// Should be: never (empty array)

type WebDependencies = ConfigType['services']['web']['needs'][number]['service']
// Should be: 'api'

export { config }