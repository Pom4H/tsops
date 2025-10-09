/**
 * Demonstrate TypeScript type constraints work at type level
 */

import { createServiceContext, type ServiceDefinition } from '@tsops/core'

// Define services with explicit typing
const mockServices: Record<string, ServiceDefinition> = {
  api: {
    kind: 'api',
    listen: { protocol: 'http', port: 8080 },
    needs: [],
    resources: { cpu: '100m', memory: '128Mi', replicas: 1 }
  },
  web: {
    kind: 'gateway',
    listen: { protocol: 'http', port: 80 },
    needs: [],
    resources: { cpu: '100m', memory: '128Mi', replicas: 1 }
  }
}

// This function demonstrates type constraints
function testServiceAccess(serviceName: keyof typeof mockServices) {
  const context = createServiceContext(
    'test-app',
    'dev',
    { domain: 'dev.test.com', debug: true, logLevel: 'debug' },
    mockServices
  )
  
  // These work because serviceName is constrained to valid keys
  const url = context.service.url(serviceName)
  const dep = context.depends.on(serviceName, 8080)
  
  return { url, dep }
}

// ✅ These work - valid service names
const apiResult = testServiceAccess('api')
const webResult = testServiceAccess('web')

// ❌ These should cause TypeScript errors (uncomment to test):
// const authResult = testServiceAccess('auth')        // Error: Argument of type '"auth"' is not assignable to parameter of type '"api" | "web"'
// const dbResult = testServiceAccess('database')     // Error: Argument of type '"database"' is not assignable to parameter of type '"api" | "web"'

console.log('✅ Valid results:')
console.log('API:', apiResult)
console.log('Web:', webResult)

console.log('\n❌ Uncomment the lines above to see TypeScript errors!')

export { testServiceAccess }