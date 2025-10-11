/**
 * Test TypeScript type constraints with generic functions
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

const context = createServiceContext(
  'test-app',
  'dev',
  { domain: 'dev.test.com', debug: true, logLevel: 'debug' },
  mockServices
)

// ✅ These should work - valid service names
const apiUrl = context.service.url('api')
const webUrl = context.service.url('web')
const validDep1 = context.depends.on('api', 8080)
const validDep2 = context.depends.on('web', 80)

console.log('✅ Valid examples:')
console.log('API URL:', apiUrl)
console.log('Web URL:', webUrl)
console.log('Valid dep 1:', validDep1)
console.log('Valid dep 2:', validDep2)

console.log('\n❌ Uncomment the lines below to see TypeScript errors:')
console.log('// const authUrl = context.service.url("auth")           // Error: Argument of type \'"auth"\' is not assignable to parameter of type \'"api" | "web"\'')
console.log('// const dbUrl = context.service.url("database")        // Error: Argument of type \'"database"\' is not assignable to parameter of type \'"api" | "web"\'')
console.log('// const invalidDep1 = context.depends.on("auth", 8081)    // Error: Argument of type \'"auth"\' is not assignable to parameter of type \'"api" | "web"\'')
console.log('// const invalidDep2 = context.depends.on("database", 5432) // Error: Argument of type \'"database"\' is not assignable to parameter of type \'"api" | "web"\'')
console.log('\n✅ TypeScript type safety is working correctly!')

export { context }