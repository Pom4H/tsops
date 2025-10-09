/**
 * Examples of compile-time errors that TypeScript will catch
 * These configurations will show type errors before runtime
 */

import { defineConfigV2 } from '@tsops/core/config/v2'

// ❌ ERROR 1: Service doesn't exist
export const missingServiceConfig = defineConfigV2({
  project: 'test',
  namespaces: { prod: { domain: 'test.com' } },
  services: ({ net, res, depends }) => ({
    web: {
      kind: 'gateway',
      listen: net.http(8080),
      needs: [
        depends.on('nonexistent-service', 8080) // ❌ TypeScript error: Service 'nonexistent-service' not found
      ],
      resources: res.smol
    }
  })
})

// ❌ ERROR 2: Wrong port
export const wrongPortConfig = defineConfigV2({
  project: 'test',
  namespaces: { prod: { domain: 'test.com' } },
  services: ({ net, res, depends }) => ({
    api: {
      kind: 'api',
      listen: net.http(8080), // API listens on 8080
      needs: [],
      resources: res.medium
    },
    web: {
      kind: 'gateway',
      listen: net.http(80),
      needs: [
        depends.on('api', 3000) // ❌ TypeScript error: Service 'api' does not listen on port 3000 (actual: 8080, expected: 3000)
      ],
      resources: res.smol
    }
  })
})

// ❌ ERROR 3: Wrong protocol
export const wrongProtocolConfig = defineConfigV2({
  project: 'test',
  namespaces: { prod: { domain: 'test.com' } },
  services: ({ net, res, depends }) => ({
    database: {
      kind: 'database',
      listen: net.tcp(5432), // Database uses TCP
      needs: [],
      resources: res.large
    },
    api: {
      kind: 'api',
      listen: net.http(8080),
      needs: [
        depends.on('database', 5432, { protocol: 'http' }) // ❌ TypeScript error: Service 'database' does not use protocol 'http' (actual: 'tcp', expected: 'http')
      ],
      resources: res.medium
    }
  })
})

// ❌ ERROR 4: Multiple errors
export const multipleErrorsConfig = defineConfigV2({
  project: 'test',
  namespaces: { prod: { domain: 'test.com' } },
  services: ({ net, res, depends }) => ({
    api: {
      kind: 'api',
      listen: net.http(8080),
      needs: [],
      resources: res.medium
    },
    web: {
      kind: 'gateway',
      listen: net.http(80),
      needs: [
        depends.on('api', 3000),           // ❌ Wrong port
        depends.on('auth', 8081),          // ❌ Service doesn't exist
        depends.on('database', 5432, { 
          protocol: 'http'                 // ❌ Wrong protocol
        })
      ],
      resources: res.smol
    }
  })
})

// ✅ CORRECTED VERSION
export const correctedConfig = defineConfigV2({
  project: 'test',
  namespaces: { prod: { domain: 'test.com' } },
  services: ({ net, res, depends }) => ({
    api: {
      kind: 'api',
      listen: net.http(8080),
      needs: [],
      resources: res.medium
    },
    auth: {
      kind: 'api',
      listen: net.http(8081),
      needs: [],
      resources: res.medium
    },
    database: {
      kind: 'database',
      listen: net.tcp(5432),
      needs: [],
      resources: res.large
    },
    web: {
      kind: 'gateway',
      listen: net.http(80),
      needs: [
        depends.on('api', 8080),           // ✅ Correct port
        depends.on('auth', 8081),          // ✅ Service exists
        depends.on('database', 5432, { 
          protocol: 'tcp'                  // ✅ Correct protocol
        })
      ],
      resources: res.smol
    }
  })
})

// Type-level validation examples
type MissingServiceError = typeof missingServiceConfig
type WrongPortError = typeof wrongPortConfig  
type WrongProtocolError = typeof wrongProtocolConfig
type MultipleErrors = typeof multipleErrorsConfig

// These types would contain error information:
// type WebDependencies = MissingServiceError['services']['web']['needs']
// type ApiPortError = WrongPortError['services']['web']['needs'][0]
// type DatabaseProtocolError = WrongProtocolError['services']['api']['needs'][0]

// Runtime validation would also catch these errors
try {
  const isValid = missingServiceConfig.validateTopology()
  console.log('Config is valid:', isValid)
} catch (error) {
  console.error('Configuration validation failed:', error)
}