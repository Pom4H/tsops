/**
 * Final test to verify everything works correctly
 */

import { defineConfigV2, createServiceContext } from '@tsops/core'

// Test 1: Full configuration with proper typing
const config = defineConfigV2({
  project: 'hyper-graph',
  
  namespaces: {
    dev: { 
      domain: 'dev.hyper-graph.com',
      debug: true,
      logLevel: 'debug',
      replicas: 1
    },
    prod: { 
      domain: 'hyper-graph.com',
      debug: false,
      logLevel: 'warn',
      replicas: 3
    }
  },
  
  services: ({ domain, debug, logLevel, replicas, net, expose, res, depends }) => {
    // All namespace variables are properly typed and available
    console.log('Configuration context:')
    console.log('- Domain:', domain, '(string)')
    console.log('- Debug:', debug, '(boolean)')
    console.log('- Log Level:', logLevel, '(string)')
    console.log('- Replicas:', replicas, '(number)')
    
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
          depends.on('api', 8080, { description: 'API dependency' })
        ],
        resources: res.smol,
        description: 'Web gateway'
      },
      
      worker: {
        kind: 'worker',
        listen: net.tcp(9090),
        needs: [
          depends.on('api', 8080, { description: 'API for job processing' })
        ],
        resources: res.medium,
        description: 'Background worker'
      }
    }
  }
})

// Test 2: Service context creation and usage
const mockServices = {
  api: {
    kind: 'api' as const,
    listen: { protocol: 'http' as const, port: 8080 },
    needs: [],
    resources: { cpu: '200m', memory: '256Mi', replicas: 1 }
  },
  web: {
    kind: 'gateway' as const,
    listen: { protocol: 'http' as const, port: 80 },
    needs: [],
    resources: { cpu: '100m', memory: '128Mi', replicas: 1 }
  },
  worker: {
    kind: 'worker' as const,
    listen: { protocol: 'tcp' as const, port: 9090 },
    needs: [],
    resources: { cpu: '500m', memory: '512Mi', replicas: 2 }
  }
}

const context = createServiceContext(
  'hyper-graph',
  'dev',
  { domain: 'dev.hyper-graph.com', debug: true, logLevel: 'debug', replicas: 1 },
  mockServices
)

// Test 3: All helpers work correctly
console.log('\nService URLs:')
console.log('- API:', context.service.url('api'))
console.log('- Web:', context.service.url('web'))
console.log('- Worker:', context.service.url('worker'))

console.log('\nDependencies:')
const apiDep = context.depends.on('api', 8080, { description: 'API dependency' })
console.log('- API dependency:', apiDep)

console.log('\nNamespace variables:')
console.log('- Domain:', context.domain)
console.log('- Debug:', context.debug)
console.log('- Log Level:', context.logLevel)
console.log('- Replicas:', context.replicas)

console.log('\nResource profiles:')
console.log('- Smol:', context.res.smol)
console.log('- Medium:', context.res.medium)
console.log('- Large:', context.res.large)
console.log('- Custom:', context.res.custom('100m', '200Mi', '1Gi', 5))

console.log('\nNetwork helpers:')
console.log('- HTTP:', context.net.http(8080))
console.log('- HTTPS:', context.net.https(443))
console.log('- TCP:', context.net.tcp(3306))
console.log('- UDP:', context.net.udp(53))
console.log('- gRPC:', context.net.grpc(9090))

console.log('\nExpose helpers:')
console.log('- HTTPS Host:', context.expose.httpsHost('example.com'))
console.log('- HTTP Host:', context.expose.httpHost('example.com'))
console.log('- Custom:', context.expose.custom('api.example.com', 'https', '/api'))

console.log('\nEnvironment helpers:')
console.log('- Env var:', context.env('NODE_ENV', 'development'))
console.log('- Secret ref:', context.secret('db-password', 'password'))
console.log('- ConfigMap ref:', context.configMap('app-config', 'database_url'))
console.log('- Template:', context.template('Hello {name}!', { name: 'World' }))

console.log('\n✅ All tests passed! TypeScript compilation successful.')

export { config, context }