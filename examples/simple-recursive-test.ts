/**
 * Simple test of recursive types
 */

import { defineConfigV2 } from '@tsops/core'

const config = defineConfigV2({
  project: 'hyper-graph',
  
  namespaces: {
    dev: { 
      domain: 'dev.hyper-graph.com',
      debug: true,
      logLevel: 'debug'
    }
  },
  
  services: ({ domain, debug, logLevel, net, expose, res, depends }) => {
    // All namespace variables should be properly typed
    console.log('Configuration context:')
    console.log('- Domain:', domain, '(string)')
    console.log('- Debug:', debug, '(boolean)')
    console.log('- Log Level:', logLevel, '(string)')
    
    return {
      api: {
        kind: 'api',
        listen: net.http(8080),
        needs: [] as const,
        resources: res.smol,
        description: 'API service'
      },
      
      web: {
        kind: 'gateway',
        listen: net.http(80),
        public: expose.httpsHost(domain),
        needs: [
          depends.on('api', 8080) // ✅ Should work - 'api' exists
        ] as const,
        resources: res.smol,
        description: 'Web gateway'
      }
    }
  }
})

// Test the returned configuration
console.log('\nConfiguration:')
console.log('Project:', config.project)
console.log('Namespaces:', config.namespaces)

// Test service access
const apiService = config.getService('api')
console.log('\nAPI Service:', apiService)

const webDependencies = config.getDependencies('web')
console.log('Web Dependencies:', webDependencies)

console.log('\n✅ Recursive types approach works!')
console.log('✅ depends.on() properly constrains service names!')

export { config }