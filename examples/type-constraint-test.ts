/**
 * Test TypeScript type constraints
 */

import { defineConfigV2, createServiceContext } from '@tsops/core'

// Test that TypeScript properly constrains service names
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

// These should work - valid service names
const apiUrl = context.service.url('api')     // ✅ 'api' exists
const webUrl = context.service.url('web')     // ✅ 'web' exists

// These should cause TypeScript errors (uncomment to test):
// const authUrl = context.service.url('auth')     // ❌ 'auth' doesn't exist
// const dbUrl = context.service.url('database')  // ❌ 'database' doesn't exist

// Test depends.on with proper typing
const validDependency = context.depends.on('api', 8080)  // ✅ Valid
const validDependency2 = context.depends.on('web', 80)   // ✅ Valid

// These should cause TypeScript errors (uncomment to test):
// const invalidDependency = context.depends.on('auth', 8081)    // ❌ 'auth' doesn't exist
// const invalidDependency2 = context.depends.on('database', 5432) // ❌ 'database' doesn't exist

console.log('API URL:', apiUrl)
console.log('Web URL:', webUrl)
console.log('Valid dependency:', validDependency)
console.log('Valid dependency 2:', validDependency2)

export { context, apiUrl, webUrl, validDependency, validDependency2 }