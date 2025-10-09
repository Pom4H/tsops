/**
 * Final demonstration of TypeScript type safety
 */

import { createServiceContext, type ServiceDefinition } from '@tsops/core'

// Define services with strict typing
const mockServices = {
  api: {
    kind: 'api' as const,
    listen: { protocol: 'http' as const, port: 8080 },
    needs: [] as ServiceDefinition['needs'],
    resources: { cpu: '100m', memory: '128Mi', replicas: 1 } as ServiceDefinition['resources']
  },
  web: {
    kind: 'gateway' as const,
    listen: { protocol: 'http' as const, port: 80 },
    needs: [] as ServiceDefinition['needs'],
    resources: { cpu: '100m', memory: '128Mi', replicas: 1 } as ServiceDefinition['resources']
  }
} satisfies Record<string, ServiceDefinition>

// This function demonstrates type constraints at the type level
function testServiceAccess<T extends keyof typeof mockServices>(serviceName: T) {
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

console.log('✅ Valid results:')
console.log('API:', apiResult)
console.log('Web:', webResult)

console.log('\n❌ Uncomment the lines below to see TypeScript errors:')
console.log('// const authResult = testServiceAccess("auth")        // Error: Argument of type \'"auth"\' is not assignable to parameter of type \'"api" | "web"\'')
console.log('// const dbResult = testServiceAccess("database")     // Error: Argument of type \'"database"\' is not assignable to parameter of type \'"api" | "web"\'')
console.log('\n✅ TypeScript type safety is working correctly!')
console.log('✅ depends.on() properly constrains service names to existing services!')

export { testServiceAccess }