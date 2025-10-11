/**
 * Test basic TypeScript functionality
 */

import { defineConfigV2, createServiceContext } from '@tsops/core'

// Test 1: Basic configuration works
const config = defineConfigV2({
  project: 'test-app',
  
  namespaces: {
    dev: { 
      domain: 'dev.test.com',
      debug: true,
      logLevel: 'debug'
    }
  },
  
  services: ({ domain, debug, logLevel, net, expose, res, depends }) => {
    // Test that namespace variables are properly typed
    const domainType: string = domain
    const debugType: boolean = debug
    const logLevelType: string = logLevel
    
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
          depends.on('api', 8080)
        ],
        resources: res.smol,
        description: 'Web gateway'
      }
    }
  }
})

// Test 2: Service context creation works
const mockServices = {
  api: {
    kind: 'api' as const,
    listen: { protocol: 'http' as const, port: 8080 },
    needs: [],
    resources: { cpu: '100m', memory: '128Mi', replicas: 1 }
  },
  web: {
    kind: 'gateway' as const,
    listen: { protocol: 'http' as const, port: 80 },
    needs: [],
    resources: { cpu: '100m', memory: '128Mi', replicas: 1 }
  }
}

const context = createServiceContext(
  'test-app',
  'dev',
  { domain: 'dev.test.com', debug: true, logLevel: 'debug' },
  mockServices
)

// Test that context has proper types
const apiUrl: string = context.service.url('api')
const webUrl: string = context.service.url('web')
const domainVar: string = context.domain
const debugVar: boolean = context.debug

// Test that depends.on works with proper typing
const dependency = context.depends.on('api', 8080)
const dependencyType: { service: string; port: number; protocol: string; description?: string; optional?: boolean } = dependency

console.log('Config:', config)
console.log('Context:', context)
console.log('Dependency:', dependency)

export { config, context, dependency }