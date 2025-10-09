/**
 * Test type-level constraints
 */

import { createServiceContext } from '@tsops/core'

// Define services with specific types
const mockServices = {
  api: {
    kind: 'api' as const,
    listen: { protocol: 'http' as const, port: 8080 },
    needs: [] as any[],
    resources: { cpu: '100m', memory: '128Mi', replicas: 1 }
  },
  web: {
    kind: 'gateway' as const,
    listen: { protocol: 'http' as const, port: 80 },
    needs: [] as any[],
    resources: { cpu: '100m', memory: '128Mi', replicas: 1 }
  }
}

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

// ❌ These should cause TypeScript errors (uncomment to test):
// const authUrl = context.service.url('auth')           // Error: Argument of type '"auth"' is not assignable to parameter of type '"api" | "web"'
// const dbUrl = context.service.url('database')        // Error: Argument of type '"database"' is not assignable to parameter of type '"api" | "web"'
// const invalidDep1 = context.depends.on('auth', 8081)    // Error: Argument of type '"auth"' is not assignable to parameter of type '"api" | "web"'
// const invalidDep2 = context.depends.on('database', 5432) // Error: Argument of type '"database"' is not assignable to parameter of type '"api" | "web"'

console.log('✅ Valid examples:')
console.log('API URL:', apiUrl)
console.log('Web URL:', webUrl)
console.log('Valid dep 1:', validDep1)
console.log('Valid dep 2:', validDep2)

console.log('\n❌ Uncomment the lines above to see TypeScript errors!')

export { context }