/**
 * Demonstrate TypeScript type errors (uncomment lines to see errors)
 */

import { createServiceContext } from '@tsops/core'

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

// ✅ These work - valid service names
const apiUrl = context.service.url('api')
const webUrl = context.service.url('web')
const validDependency = context.depends.on('api', 8080)

// ❌ Uncomment these lines to see TypeScript errors:
// const authUrl = context.service.url('auth')           // Error: Argument of type '"auth"' is not assignable to parameter of type '"api" | "web"'
// const dbUrl = context.service.url('database')        // Error: Argument of type '"database"' is not assignable to parameter of type '"api" | "web"'
// const invalidDependency = context.depends.on('auth', 8081)    // Error: Argument of type '"auth"' is not assignable to parameter of type '"api" | "web"'
// const invalidDependency2 = context.depends.on('database', 5432) // Error: Argument of type '"database"' is not assignable to parameter of type '"api" | "web"'

console.log('✅ Valid examples work:')
console.log('API URL:', apiUrl)
console.log('Web URL:', webUrl)
console.log('Valid dependency:', validDependency)

console.log('\n❌ Uncomment the lines above to see TypeScript errors!')

export { context }