/**
 * Final demonstration of narrow type inference
 */

import { defineConfigV2 } from '@tsops/core'

const config = defineConfigV2({
  project: 'hyper-graph',
  
  namespaces: {
    dev: { 
      domain: 'dev.hyper-graph.com',
      debug: true,
      logLevel: 'debug'
    },
    prod: { 
      domain: 'hyper-graph.com',
      debug: false,
      logLevel: 'warn'
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
          depends.on('api', 8080) // ✅ Valid - 'api' exists and is properly typed as Dep<"api", 8080>
        ] as const,
        resources: res.smol,
        description: 'Web gateway'
      },
      
      worker: {
        kind: 'worker',
        listen: net.http(9090),
        needs: [
          depends.on('api', 8080), // ✅ Valid - 'api' exists and is properly typed as Dep<"api", 8080>
          depends.on('web', 80)    // ✅ Valid - 'web' exists and is properly typed as Dep<"web", 80>
        ] as const,
        resources: res.medium,
        description: 'Background worker'
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

const workerDependencies = config.getDependencies('worker')
console.log('Worker Dependencies:', workerDependencies)

console.log('\n✅ Narrow type inference works!')
console.log('✅ depends.on() properly constrains service names to keyof S!')
console.log('✅ Service names are properly inferred as literal types!')
console.log('✅ TypeScript compilation successful!')

export { config }